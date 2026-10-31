// Évite la fenêtre console en release sous Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    fancontroller_lib::run()
}
