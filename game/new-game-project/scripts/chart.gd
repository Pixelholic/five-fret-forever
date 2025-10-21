extends LineEdit

@onready var textedit = $"."
@onready var browsebutton = $BrowseButton
@onready var browsebuttonpicker = $BrowseButton/ChartPicker

@onready var confirmbutton = $ConfirmButton

func _ready():
	browsebuttonpicker.current_dir = "/"
	browsebutton.pressed.connect(_browse_pressed)
	confirmbutton.pressed.connect(_confirm_pressed)

func _browse_pressed() -> void:
	browsebuttonpicker.visible = true

func _on_chart_picker_dir_selected(dir: String) -> void:
	textedit.text = dir

func _confirm_pressed() -> void:
	var path = textedit.text # i am re-assigning for readability purposes :)
	
	var chart = path + "/notes.chart"
	var metadata = path + "/song.ini"
	
	if !FileAccess.file_exists(chart):
		print("chart not found!")
		return
	elif !FileAccess.file_exists(metadata):
		print("song.ini not found!")
		return
	
	var chartdata = FileAccess.open(chart, FileAccess.READ).get_as_text()
	
	var song_section = chartdata.get_slice("[Song]", 1)
	song_section = song_section.replace("\n{", "")
	song_section = song_section.replace("  ", "")
	var index = song_section.find("}") - 1
	
	song_section = song_section.substr(0, index + 1) # keep only everything up until the next squiggly bracket
	
	# i am tired, it is 12 am so i will do the rest of this tomorrow :)
	
	print(song_section)
	
	
