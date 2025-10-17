import { parseChart } from 'parsehero';

export interface ParsedNote {
    lane: number;
    time: number; // Time in seconds when the note should be hit
    duration: number; // Duration in seconds
}

export function processChart(chartText: string): ParsedNote[] {
    const parsed = parseChart(chartText);

    // Default to Expert Single, but you could add logic to select other difficulties
    const difficulty = parsed.chart.ExpertSingle

    if (!difficulty) {
        console.error("No standard difficulties found in chart.");
        return [];
    }

    const notes: ParsedNote[] = [];
    for (const note of difficulty) {
        if (note.fret >= 0 && note.fret <= 4) { // Only handle the 5 main frets
            notes.push({
                lane: note.fret,
                time: note.time,
                duration: note.duration,
            });
        }
    }

    return notes;
}