fn main() {
    // IMPORTANT : la DLL ASUS exige les droits admin. On ne demande l'UAC qu'en release —
    // en dev, `tauri dev` ne pourrait pas lancer un exe qui exige l'élévation depuis un terminal normal.
    let attrs = if std::env::var("PROFILE").as_deref() == Ok("release") {
        tauri_build::Attributes::new().windows_attributes(
            tauri_build::WindowsAttributes::new().app_manifest(include_str!("app.manifest")),
        )
    } else {
        tauri_build::Attributes::new()
    };
    tauri_build::try_build(attrs).expect("failed to run tauri-build");
}
