use std::io::Write;
use std::net::TcpStream;
use std::os::windows::process::CommandExt;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, RunEvent, WindowEvent};

const CORE_ADDR: &str = "127.0.0.1:8787";
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
/// Nom de la tâche planifiée qui lance l'interface à l'ouverture de session.
const TASK_NAME: &str = "BaridiFancontroller";
/// Argument passé par la tâche planifiée : démarrer réduit dans la zone de notification.
const MINIMIZED_ARG: &str = "--minimized";

/// Sidecar Go qui pilote réellement les ventilateurs.
struct Core(Mutex<Option<Child>>);

/// Identifiant unique de ce lancement : le front s'en sert pour savoir si le journal stocké
/// en localStorage appartient à la session en cours (sinon il est jeté).
struct Session(String);

#[tauri::command]
fn session_id(session: tauri::State<Session>) -> String {
    session.0.clone()
}

/// Lance le contrôleur à côté de l'exe (Tauri y dépose les externalBin sans suffixe de triple).
/// IMPORTANT : on passe notre PID — le contrôleur se ferme tout seul si l'UI crash, sinon
/// un sidecar orphelin continuerait de piloter les ventilateurs.
fn spawn_core() -> std::io::Result<Child> {
    let exe = std::env::current_exe()?;
    let dir = exe.parent().expect("exe sans dossier parent");
    Command::new(dir.join("fancontroller-core.exe"))
        .args(["--parent-pid", &std::process::id().to_string(), "--addr", CORE_ADDR])
        .current_dir(dir)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
}

/// Fichier de la clé d'API, à côté de l'exécutable du contrôleur. C'est LUI qui le crée au premier démarrage, avec des
/// droits réservés à SYSTEM et aux administrateurs : une application lancée sans élévation ne peut pas le lire.
const API_KEY_FILE: &str = "api.key";

/// Lit la clé d'API partagée avec le contrôleur (64 caractères hexadécimaux).
fn read_api_key() -> Result<String, String> {
    let core = core_exe()?;
    let dir = core.parent().ok_or("dossier du contrôleur introuvable")?;
    let raw = std::fs::read_to_string(dir.join(API_KEY_FILE)).map_err(|e| {
        format!("clé de l'API illisible ({e}) : le contrôleur la crée à son démarrage, et l'application doit s'exécuter en administrateur")
    })?;
    let key = raw.trim().to_string();
    if key.len() == 64 && key.bytes().all(|b| b.is_ascii_hexdigit()) {
        Ok(key)
    } else {
        Err("clé de l'API invalide".into())
    }
}

const TRAY_ID: &str = "main";

/// Met à jour l'icône et l'infobulle de la zone de notification (appelée par l'interface quand la température change).
/// `rgba` : width × height × 4 octets, dessinés côté interface.
#[tauri::command]
fn set_tray(app: AppHandle, rgba: Vec<u8>, width: u32, height: u32, tooltip: String) -> Result<(), String> {
    if rgba.len() != (width as usize) * (height as usize) * 4 {
        return Err("taille d'image incohérente".into());
    }
    let tray = app.tray_by_id(TRAY_ID).ok_or("icône de la zone de notification introuvable")?;
    tray.set_icon(Some(Image::new_owned(rgba, width, height))).map_err(|e| e.to_string())?;
    tray.set_tooltip(Some(tooltip)).map_err(|e| e.to_string())
}

/// Clé d'API pour l'interface : elle l'envoie à chaque requête (en-tête Authorization, ou paramètre pour le flux SSE).
#[tauri::command]
fn api_key() -> Result<String, String> {
    read_api_key()
}

/// Demande un arrêt propre (restauration du profil balanced) via POST /quit.
/// TCP brut : évite d'embarquer un client HTTP pour une seule requête.
///
/// IMPORTANT : /quit exige la clé comme toutes les routes. Sans elle (fichier illisible), la requête part quand même
/// et se fait refuser : le contrôleur sera alors arrêté par le repli de `RunEvent::Exit` (kill) plutôt que proprement.
fn request_quit() {
    if let Ok(mut s) = TcpStream::connect_timeout(&CORE_ADDR.parse().unwrap(), Duration::from_millis(500)) {
        let auth = read_api_key().map(|k| format!("Authorization: Bearer {k}\r\n")).unwrap_or_default();
        let request = format!("POST /quit HTTP/1.1\r\nHost: 127.0.0.1\r\n{auth}Content-Length: 0\r\nConnection: close\r\n\r\n");
        let _ = s.write_all(request.as_bytes());
        let _ = s.flush();
    }
}

/// Réaffiche la fenêtre principale (depuis le systray ou depuis une seconde instance).
fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Fermeture réelle : efface le journal des requêtes (localStorage) puis quitte.
/// IMPORTANT : la fenêtre n'est que masquée, donc encore vivante — son localStorage est accessible.
fn quit_app(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.eval(
            "localStorage.removeItem('fancontroller:request-log');localStorage.removeItem('fancontroller:request-log-session');",
        );
        // Laisse au webview le temps de persister la suppression avant la fermeture.
        std::thread::sleep(Duration::from_millis(250));
    }
    app.exit(0);
}

// ─── Service Windows du contrôleur ─────────────────────────────────────────────

fn core_exe() -> Result<std::path::PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    Ok(exe.parent().ok_or("exe sans dossier parent")?.join("fancontroller-core.exe"))
}

/// Ouvre dans l'Explorateur le dossier où le contrôleur garde ses fichiers (settings.json, profiles.json).
///
/// IMPORTANT : aucun chemin en argument. Le dossier est celui de l'exe du contrôleur, déduit côté Rust :
/// la webview ne peut donc pas s'en servir pour faire ouvrir n'importe quel emplacement.
#[tauri::command]
fn open_config_dir() -> Result<(), String> {
    let core = core_exe()?;
    let dir = core.parent().ok_or("dossier du contrôleur introuvable")?;
    // spawn et non status : explorer.exe renvoie un code de sortie non nul même quand l'ouverture réussit.
    Command::new("explorer").arg(dir).spawn().map(|_| ()).map_err(|e| format!("explorer introuvable : {e}"))
}

/// Vrai si quelque chose répond déjà sur le port du contrôleur (service Windows ou sidecar existant).
fn core_reachable() -> bool {
    TcpStream::connect_timeout(&CORE_ADDR.parse().unwrap(), Duration::from_millis(300)).is_ok()
}

/// Attend que le port soit ouvert (open = true) ou libéré (open = false).
fn wait_port(open: bool, secs: u64) -> bool {
    let deadline = std::time::Instant::now() + Duration::from_secs(secs);
    while std::time::Instant::now() < deadline {
        if core_reachable() == open {
            return true;
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    core_reachable() == open
}

/// Exécute une sous-commande du contrôleur (install, uninstall, status) et renvoie sa sortie.
fn run_core(arg: &str) -> Result<String, String> {
    let out = Command::new(core_exe()?)
        .arg(arg)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("contrôleur introuvable : {e}"))?;
    let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if out.status.success() {
        Ok(stdout)
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

/// État du service : "not-installed", "stopped" ou "running".
#[tauri::command]
async fn service_status() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(|| run_core("status"))
        .await
        .map_err(|e| e.to_string())?
}

/// Libère le port en arrêtant notre propre sidecar (s'il existe).
fn stop_own_core(app: &AppHandle) {
    let child = app.state::<Core>().0.lock().unwrap().take();
    if let Some(mut child) = child {
        request_quit();
        // Laisse Cleanup() ramener le ventilateur à un état sûr avant de rendre le port.
        wait_port(false, 5);
        let _ = child.kill();
        let _ = child.wait();
    }
}

fn start_own_core(app: &AppHandle) -> Result<(), String> {
    let child = spawn_core().map_err(|e| format!("impossible de relancer le contrôleur : {e}"))?;
    *app.state::<Core>().0.lock().unwrap() = Some(child);
    Ok(())
}

/// Installe (et démarre) ou supprime le service Windows du contrôleur.
///
/// IMPORTANT : le service et le sidecar ne peuvent pas coexister (même port, même matériel).
/// - installation : on arrête d'abord notre sidecar, puis on installe ; en cas d'échec on le relance ;
/// - suppression : on supprime le service, puis on relance un sidecar pour que l'UI reste fonctionnelle.
fn set_service(app: &AppHandle, enabled: bool) -> Result<(), String> {
    if enabled {
        stop_own_core(app);
        if let Err(e) = run_core("install") {
            let _ = start_own_core(app);
            return Err(e);
        }
        if !wait_port(true, 15) {
            return Err("le service est installé mais le contrôleur ne répond pas encore".into());
        }
        Ok(())
    } else {
        run_core("uninstall")?;
        wait_port(false, 25);
        start_own_core(app)
    }
}

#[tauri::command]
async fn service_set(app: AppHandle, enabled: bool) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || set_service(&app, enabled))
        .await
        .map_err(|e| e.to_string())?
}

// ─── Démarrage automatique de l'interface (tâche planifiée) ────────────────────

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

fn run_schtasks(args: &[&str]) -> Result<(), String> {
    let out = Command::new("schtasks")
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("schtasks introuvable : {e}"))?;
    if out.status.success() {
        return Ok(());
    }
    let text = format!(
        "{} {}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    Err(format!("schtasks a échoué (droits administrateur requis ?) : {}", text.trim()))
}

/// Vrai si la tâche planifiée existe.
#[tauri::command]
fn autostart_status() -> bool {
    Command::new("schtasks")
        .args(["/Query", "/TN", TASK_NAME])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Crée ou supprime la tâche planifiée qui démarre l'interface avec Windows.
///
/// IMPORTANT : l'exécutable exige les droits administrateur (manifeste). Une clé de registre « Run »
/// ne pourrait pas le lancer à l'ouverture de session (Windows n'affiche pas l'UAC à ce moment-là) ;
/// une tâche planifiée avec les privilèges maximaux, si. Créée en ligne de commande, elle refuserait
/// de démarrer sur batterie : on passe donc par un XML qui lève cette restriction, et qui ajoute un
/// court délai après la connexion pour laisser le système (et le service) se stabiliser.
#[tauri::command]
fn autostart_set(enabled: bool) -> Result<(), String> {
    if !enabled {
        return run_schtasks(&["/Delete", "/TN", TASK_NAME, "/F"]);
    }

    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let dir = exe.parent().ok_or("exe sans dossier parent")?;
    let user = format!(
        "{}\\{}",
        std::env::var("USERDOMAIN").unwrap_or_default(),
        std::env::var("USERNAME").map_err(|_| "variable USERNAME absente".to_string())?
    );

    let xml = format!(
        r#"<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Démarre Baridi - Fancontroller à l'ouverture de session, réduit dans la zone de notification.</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <UserId>{user}</UserId>
      <Delay>PT10S</Delay>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>{user}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>false</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>{command}</Command>
      <Arguments>{args}</Arguments>
      <WorkingDirectory>{workdir}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>"#,
        user = xml_escape(&user),
        command = xml_escape(&exe.to_string_lossy()),
        args = MINIMIZED_ARG,
        workdir = xml_escape(&dir.to_string_lossy()),
    );

    // schtasks attend du UTF-16 LE avec BOM pour un XML déclaré en UTF-16.
    let mut bytes = vec![0xFF, 0xFE];
    for unit in xml.encode_utf16() {
        bytes.extend_from_slice(&unit.to_le_bytes());
    }
    let path = std::env::temp_dir().join("baridi-fancontroller-task.xml");
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    let result = run_schtasks(&["/Create", "/TN", TASK_NAME, "/XML", &path.to_string_lossy(), "/F"]);
    let _ = std::fs::remove_file(&path);
    result
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let session = format!(
        "{}-{}",
        std::process::id(),
        SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0)
    );

    tauri::Builder::default()
        // IMPORTANT : doit être enregistré en premier. Une seconde instance (double-clic alors que
        // l'app est dans le systray, ou tâche de démarrage) se contente de réafficher la première :
        // deux contrôleurs se disputeraient le port 8787 et le ventilateur.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        // Notifications natives Windows : alertes thermiques même quand la fenêtre est dans le systray.
        .plugin(tauri_plugin_notification::init())
        // Préférences de l'interface (alertes, raccourcis) dans %APPDATA%, hors du localStorage de la webview
        // que l'utilisateur peut vider avec le cache.
        .plugin(tauri_plugin_store::Builder::new().build())
        // Les raccourcis sont enregistrés côté JS (la webview reste vivante, masquée) : ça évite
        // de dupliquer en Rust la logique « profil suivant » qui vit déjà dans le hook useFan.
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(Session(session))
        .invoke_handler(tauri::generate_handler![session_id, service_status, service_set, autostart_status, autostart_set, open_config_dir, api_key, set_tray])
        // Croix de la fenêtre et Alt+F4 passent tous deux par CloseRequested : on masque au lieu de fermer.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(|app| {
            // Si le service Windows tourne déjà, on s'y connecte au lieu de lancer notre propre contrôleur.
            let child = if core_reachable() {
                None
            } else {
                Some(spawn_core().map_err(|e| format!("impossible de lancer le contrôleur: {e}"))?)
            };
            app.manage(Core(Mutex::new(child)));

            // Même icône pour la fenêtre (barre des tâches), le systray et l'exécutable (icons/icon.ico).
            let icon = Image::from_bytes(include_bytes!("../icons/128x128@2x.png"))?;
            let show = MenuItem::with_id(app, "show", "Afficher Baridi - Fancontroller", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            TrayIconBuilder::with_id(TRAY_ID)
                .icon(icon.clone())
                .tooltip("Baridi - Fancontroller")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main(app),
                    "quit" => quit_app(app),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;

            if let Some(window) = app.get_webview_window("main") {
                // Zoom par défaut à 80 % : interface dense, plus d'information à l'écran.
                window.set_icon(icon)?;
                window.set_zoom(0.8)?;
                // La fenêtre est créée masquée (tauri.conf) : on l'affiche sauf démarrage automatique.
                if !std::env::args().any(|a| a == MINIMIZED_ARG) {
                    window.show()?;
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Exit = event {
                // IMPORTANT : on n'arrête le contrôleur que s'il nous appartient (sidecar). Si c'est le
                // service Windows, il continue de piloter le ventilateur après la fermeture de l'UI.
                let child = app.try_state::<Core>().and_then(|core| core.0.lock().unwrap().take());
                if let Some(mut child) = child {
                    request_quit();
                    // Laisse le temps à Cleanup() de ramener le ventilateur à un état sûr.
                    std::thread::sleep(Duration::from_millis(1500));
                    let _ = child.kill();
                }
            }
        });
}
