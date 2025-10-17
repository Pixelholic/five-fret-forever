import { processChart, ParsedNote } from './chart-parser';

// A self-invoking async function to use top-level await
(async () => {
    // --- Basic Setup ---
    const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    const uiCanvas = document.getElementById('uiCanvas') as HTMLCanvasElement;
    const uiCtx = uiCanvas.getContext('2d')!;


    // -- WebGPU Initialization --
    if (!navigator.gpu) {
        throw new Error("WebGPU not supported on this browser.");
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        throw new Error("No appropriate GPUAdapter found.");
    }
    const device = await adapter.requestDevice();
    const context = canvas.getContext('webgpu');
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device: device,
        format: canvasFormat,
    });

    // --- Game Constants ---
    const lanes = 5;
    const laneWidth = canvas.width / lanes;
    const noteHeight = 20;
    const targetY = canvas.height - 50;
    const noteColors = [
        [0.0, 1.0, 0.0, 1.0], // Green
        [1.0, 0.0, 0.0, 1.0], // Red
        [1.0, 1.0, 0.0, 1.0], // Yellow
        [0.0, 0.0, 1.0, 1.0], // Blue
        [1.0, 0.5, 0.0, 1.0], // Orange
    ];
    const laneLineColor = [0.2, 0.2, 0.2, 1.0];

    // --- Game State ---
    let activeNotes: (ParsedNote & { y: number })[] = [];
    let chart: ParsedNote[] = [];
    let noteIndex = 0;
    let score = 0;
    let isPaused = true;

    // --- Web Audio API Setup ---
    const audioContext = new AudioContext();
    let audioSource: AudioBufferSourceNode | null = null;
    let startTime = 0;
    const NOTE_TRAVEL_TIME_S = 2.0; // Time in seconds for a note to go from top to target

    // --- WebGPU Rendering Setup ---
    const vertices = new Float32Array([0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0, 1.0]);
    const vertexBuffer = device.createBuffer({
        size: vertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(vertexBuffer, 0, vertices);
    const vertexBufferLayout: GPUVertexBufferLayout = {
        arrayStride: 8,
        attributes: [{ format: 'float32x2', offset: 0, shaderLocation: 0 }],
    };

    const wgslShaders = `
        struct Uniforms {
            transform: mat3x3f,
            color: vec4f,
        };
        @group(0) @binding(0) var<uniform> uniforms: Uniforms;
        @vertex fn vs(@location(0) pos: vec2f) -> @builtin(position) vec4f {
            let transformed_pos = uniforms.transform * vec3f(pos, 1.0);
            return vec4f(transformed_pos.xy, 0.0, 1.0);
        }
        @fragment fn fs() -> @location(0) vec4f { return uniforms.color; }
    `;

    const shaderModule = device.createShaderModule({ code: wgslShaders });
    const renderPipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module: shaderModule, entryPoint: 'vs', buffers: [vertexBufferLayout] },
        fragment: { module: shaderModule, entryPoint: 'fs', targets: [{ format: canvasFormat }] },
    });
    const uniformBuffer = device.createBuffer({ size: 16 * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const bindGroup = device.createBindGroup({
        layout: renderPipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });

    // --- File Loading Logic ---
    const chartInput = document.getElementById('chartInput') as HTMLInputElement;
    const audioInput = document.getElementById('audioInput') as HTMLInputElement;
    const loadSongBtn = document.getElementById('loadSongBtn') as HTMLButtonElement;

    loadSongBtn.addEventListener('click', async () => {
        const chartFile = chartInput.files?.[0];
        const audioFile = audioInput.files?.[0];
        if (!chartFile || !audioFile) { alert("Please select both a chart and an audio file."); return; }

        // Reset state
        score = 0;
        noteIndex = 0;
        activeNotes = [];
        if (audioSource) audioSource.stop();
        if (audioContext.state === 'suspended') audioContext.resume();

        // Process files
        const chartText = await chartFile.text();
        chart = processChart(chartText);
        const audioData = await audioFile.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(audioData);

        // Start the song
        audioSource = audioContext.createBufferSource();
        audioSource.buffer = audioBuffer;
        audioSource.connect(audioContext.destination);
        audioSource.start(0);
        startTime = audioContext.currentTime;
        isPaused = false;
        document.getElementById('loader')!.style.display = 'none';
    });

    // --- Main Game Loop ---
    function gameLoop() {
        const now = isPaused ? 0 : audioContext.currentTime - startTime;

        if (!isPaused) {
            // Update note positions and remove old ones
            activeNotes = activeNotes.filter(note => now < note.time + 1); // Keep notes for 1s after they pass
            for (const note of activeNotes) {
                const timeToTarget = note.time - now;
                note.y = targetY * (1 - (timeToTarget / NOTE_TRAVEL_TIME_S));
            }

            // Spawn new notes from the chart
            while (noteIndex < chart.length && chart[noteIndex].time < now + NOTE_TRAVEL_TIME_S) {
                activeNotes.push({ ...chart[noteIndex], y: 0 });
                noteIndex++;
            }
        }

        // --- Drawing ---
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
            colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: 'clear', clearValue: [0, 0, 0, 1], storeOp: 'store' }],
        });
        pass.setPipeline(renderPipeline);
        pass.setVertexBuffer(0, vertexBuffer);

        const drawRect = (x: number, y: number, width: number, height: number, color: number[]) => {
            const sx = width / canvas.width * 2, sy = height / canvas.height * 2;
            const tx = (x / canvas.width * 2) - 1, ty = -(y / canvas.height * 2) + 1 - sy;
            const transform = new Float32Array([sx, 0, 0, 0, sy, 0, tx, ty, 1]);
            const uniformData = new Float32Array(16);
            uniformData.set(transform);
            uniformData.set(color, 12);
            device.queue.writeBuffer(uniformBuffer, 0, uniformData);
            pass.setBindGroup(0, bindGroup);
            pass.draw(6);
        };

        // Draw lanes, targets, and notes
        for (let i = 1; i < lanes; i++) drawRect(i * laneWidth - 1, 0, 2, canvas.height, laneLineColor);
        for (let i = 0; i < lanes; i++) drawRect(i * laneWidth, targetY, laneWidth, noteHeight, [...noteColors[i].slice(0, 3), 0.4]);
        for (const note of activeNotes) drawRect(note.lane * laneWidth, note.y, laneWidth, noteHeight, noteColors[note.lane]);

        pass.end();
        device.queue.submit([encoder.finish()]);

        // Draw UI
        uiCtx.clearRect(0, 0, uiCanvas.width, uiCanvas.height);
        uiCtx.fillStyle = '#FFF';
        uiCtx.font = '24px Arial';
        uiCtx.fillText(`Score: ${score}`, 10, 30);

        requestAnimationFrame(gameLoop);
    }
    gameLoop(); // Start the loop
})();