// The desktop app's start: no console window on Windows in a release build.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    contour_and_gable_lib::run()
}
