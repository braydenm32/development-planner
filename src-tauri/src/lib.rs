// The desktop app: the same planner as contourandgable.com, in its own window, with what a
// browser can't do. Every command here is called from src/desktop/bridge.ts.
//
// - Files straight into folders: projects into the projects folder, everything else (PDFs, DXFs,
//   models, prints) into the exports folder, with no save prompt (write_file).
// - Files read straight from disk, however big (read_file), and the projects folder listed
//   (list_files).
// - A print sent straight to the slicer (find_slicers, open_with).
// - Folder and app pickers, and "Show in folder".

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::UNIX_EPOCH;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Info {
    version: String,
    os: String,
    projects_dir: String,
    exports_dir: String,
}

/// The app's version, the computer's system, and the folders it uses until the person picks others:
/// Documents/Contour and Gable/Projects and …/Exports.
#[tauri::command]
fn desktop_info(app: tauri::AppHandle) -> Result<Info, String> {
    let docs = app
        .path()
        .document_dir()
        .or_else(|_| app.path().home_dir())
        .map_err(|e| e.to_string())?;
    let root = docs.join("Contour and Gable");
    Ok(Info {
        version: app.package_info().version.to_string(),
        os: std::env::consts::OS.to_string(),
        projects_dir: root.join("Projects").display().to_string(),
        exports_dir: root.join("Exports").display().to_string(),
    })
}

/// %XX in a header value back to what it was (file names travel percent-encoded).
fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// A file name with nothing in it that could reach outside its folder or upset a file system.
fn safe_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            c if c.is_control() => '-',
            c => c,
        })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.').to_string();
    if trimmed.is_empty() {
        "file".to_string()
    } else {
        trimmed
    }
}

/// Write a file into a folder (made if need be), replacing one of the same name. The bytes come
/// raw, the folder and name in the x-dir and x-name headers. Written beside it first and then
/// moved into place, so a crash never leaves half a file. Returns where it went.
#[tauri::command]
async fn write_file(request: Request<'_>) -> Result<String, String> {
    let header = |k: &str| -> Result<String, String> {
        request
            .headers()
            .get(k)
            .and_then(|v| v.to_str().ok())
            .map(percent_decode)
            .ok_or_else(|| format!("missing {k}"))
    };
    let dir = PathBuf::from(header("x-dir")?);
    let name = safe_name(&header("x-name")?);
    let data = match request.body() {
        InvokeBody::Raw(b) => b.clone(),
        InvokeBody::Json(v) => v.as_str().map(|s| s.as_bytes().to_vec()).unwrap_or_default(),
    };
    fs::create_dir_all(&dir).map_err(|e| format!("Couldn’t make the folder {}: {e}", dir.display()))?;
    let path = dir.join(&name);
    let tmp = dir.join(format!(".{name}.saving"));
    fs::write(&tmp, &data).map_err(|e| format!("Couldn’t save {}: {e}", path.display()))?;
    fs::rename(&tmp, &path).map_err(|e| {
        let _ = fs::remove_file(&tmp);
        format!("Couldn’t save {}: {e}", path.display())
    })?;
    Ok(path.display().to_string())
}

/// A file's bytes, straight from disk, however big.
#[tauri::command]
async fn read_file(path: String) -> Result<Response, String> {
    fs::read(&path)
        .map(Response::new)
        .map_err(|e| format!("Couldn’t read {path}: {e}"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Listed {
    name: String,
    path: String,
    modified: u64,
    size: u64,
}

/// The files in a folder whose names end with `ending`, newest first. An empty list if there's no folder yet.
#[tauri::command]
async fn list_files(dir: String, ending: String) -> Result<Vec<Listed>, String> {
    let Ok(read) = fs::read_dir(&dir) else {
        return Ok(vec![]);
    };
    let end = ending.to_lowercase();
    let mut out: Vec<Listed> = read
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') || !name.to_lowercase().ends_with(&end) {
                return None;
            }
            let meta = e.metadata().ok()?;
            if !meta.is_file() {
                return None;
            }
            let modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            Some(Listed { name, path: e.path().display().to_string(), modified, size: meta.len() })
        })
        .collect();
    out.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(out)
}

/// Pick a folder, starting in `start`.
#[tauri::command]
async fn pick_folder(app: tauri::AppHandle, start: Option<String>, title: String) -> Option<String> {
    let mut d = app.dialog().file().set_title(title);
    if let Some(s) = start.filter(|s| Path::new(s).exists()) {
        d = d.set_directory(s);
    }
    d.blocking_pick_folder().and_then(|p| p.into_path().ok()).map(|p| p.display().to_string())
}

/// Pick a file to open, starting in `start`, of the kinds named (["Surveys", ["dxf", "xml"]], …).
#[tauri::command]
async fn pick_file(app: tauri::AppHandle, start: Option<String>, title: String, filters: Vec<(String, Vec<String>)>) -> Option<String> {
    let mut d = app.dialog().file().set_title(title);
    for (name, exts) in &filters {
        let e: Vec<&str> = exts.iter().map(|s| s.as_str()).collect();
        d = d.add_filter(name, &e);
    }
    if let Some(s) = start.filter(|s| Path::new(s).exists()) {
        d = d.set_directory(s);
    }
    d.blocking_pick_file().and_then(|p| p.into_path().ok()).map(|p| p.display().to_string())
}

/// Show a file in Finder, Explorer or the file manager.
#[tauri::command]
async fn reveal(path: String) -> Result<(), String> {
    tauri_plugin_opener::reveal_item_in_dir(&path).map_err(|e| e.to_string())
}

/// Open a file with the computer's own app for it.
#[tauri::command]
async fn open_default(path: String) -> Result<(), String> {
    tauri_plugin_opener::open_path(&path, None::<&str>).map_err(|e| e.to_string())
}

#[derive(Serialize, Clone)]
struct Slicer {
    name: String,
    path: String,
}

/// Slicers by the names their apps and programs go by, and what to call each.
const SLICERS: &[(&str, &[&str])] = &[
    ("OrcaSlicer", &["orcaslicer", "orca-slicer"]),
    ("PrusaSlicer", &["prusaslicer", "prusa-slicer"]),
    ("Bambu Studio", &["bambustudio", "bambu studio", "bambu-studio"]),
    ("ElegooSlicer", &["elegooslicer", "elegoo slicer", "elegoo-slicer"]),
    ("Creality Print", &["crealityprint", "creality print", "creality-print"]),
    ("UltiMaker Cura", &["ultimaker-cura", "ultimaker cura", "cura"]),
    ("SuperSlicer", &["superslicer"]),
    ("Anycubic Slicer Next", &["anycubicslicernext", "anycubic slicer next", "anycubicslicer"]),
    ("FlashPrint", &["flashprint"]),
    ("Snapmaker Orca", &["snapmaker_orca", "snapmaker orca"]),
];

/// Which slicer a file or app name is, if it's one.
fn slicer_named(file: &str) -> Option<&'static str> {
    let n = file.to_lowercase();
    let stem = n.trim_end_matches(".exe").trim_end_matches(".app").trim_end_matches(".appimage");
    SLICERS
        .iter()
        .find(|(_, keys)| keys.iter().any(|k| stem == *k || stem.starts_with(&format!("{k} ")) || stem.starts_with(&format!("{k}-")) || stem.starts_with(&format!("{k}_"))))
        .map(|(name, _)| *name)
}

fn push(found: &mut Vec<Slicer>, name: &str, path: PathBuf) {
    let p = path.display().to_string();
    if !found.iter().any(|s| s.path == p || s.name == name) {
        found.push(Slicer { name: name.to_string(), path: p });
    }
}

/// Look `depth` folders down from `dir` for slicer programs (Windows .exe) or apps (macOS .app).
fn scan(dir: &Path, depth: u32, found: &mut Vec<Slicer>) {
    let Ok(read) = fs::read_dir(dir) else { return };
    for e in read.flatten() {
        let path = e.path();
        let name = e.file_name().to_string_lossy().into_owned();
        let lower = name.to_lowercase();
        let is_app = lower.ends_with(".app");
        let is_exe = lower.ends_with(".exe") || lower.ends_with(".appimage");
        if is_app || is_exe {
            // Cura's folder holds helpers (CuraEngine.exe); only the app itself counts.
            if lower.contains("engine") || lower.contains("uninst") || lower.contains("console") {
                continue;
            }
            if let Some(s) = slicer_named(&name) {
                push(found, s, path);
            }
        } else if depth > 0 && path.is_dir() {
            scan(&path, depth - 1, found);
        }
    }
}

/// The slicers this computer has, where they're usually installed.
#[tauri::command]
async fn find_slicers() -> Vec<Slicer> {
    let mut found = vec![];
    let home = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")).map(PathBuf::from);
    if cfg!(target_os = "macos") {
        scan(Path::new("/Applications"), 1, &mut found);
        if let Some(h) = &home {
            scan(&h.join("Applications"), 1, &mut found);
        }
    } else if cfg!(target_os = "windows") {
        for var in ["ProgramFiles", "ProgramFiles(x86)", "ProgramW6432"] {
            if let Some(d) = std::env::var_os(var) {
                scan(Path::new(&d), 2, &mut found);
            }
        }
        if let Some(d) = std::env::var_os("LOCALAPPDATA") {
            scan(&Path::new(&d).join("Programs"), 2, &mut found);
        }
    } else {
        // Programs on the PATH, AppImages in the usual places, and Flatpaks.
        if let Some(path) = std::env::var_os("PATH") {
            for d in std::env::split_paths(&path) {
                let Ok(read) = fs::read_dir(&d) else { continue };
                for e in read.flatten() {
                    if let Some(s) = slicer_named(&e.file_name().to_string_lossy()) {
                        push(&mut found, s, e.path());
                    }
                }
            }
        }
        if let Some(h) = &home {
            for d in ["Applications", "Downloads", ".local/bin", "AppImages"] {
                scan(&h.join(d), 0, &mut found);
            }
        }
        const FLATPAKS: &[(&str, &str)] = &[
            ("OrcaSlicer", "io.github.softfever.OrcaSlicer"),
            ("PrusaSlicer", "com.prusa3d.PrusaSlicer"),
            ("Bambu Studio", "com.bambulab.BambuStudio"),
            ("UltiMaker Cura", "com.ultimaker.cura"),
            ("SuperSlicer", "com.superslicer.SuperSlicer"),
        ];
        for (name, id) in FLATPAKS {
            let system = Path::new("/var/lib/flatpak/app").join(id);
            let user = home.as_ref().map(|h| h.join(".local/share/flatpak/app").join(id));
            if system.exists() || user.map(|u| u.exists()).unwrap_or(false) {
                push(&mut found, name, PathBuf::from(format!("flatpak:{id}")));
            }
        }
    }
    found
}

/// Open `file` in the app at `app` (a slicer): a macOS .app, a program, or "flatpak:<id>".
#[tauri::command]
async fn open_with(app: String, file: String) -> Result<(), String> {
    let mut cmd = if let Some(id) = app.strip_prefix("flatpak:") {
        let mut c = Command::new("flatpak");
        c.args(["run", "--file-forwarding", id, "@@", &file, "@@"]);
        c
    } else if cfg!(target_os = "macos") && app.to_lowercase().ends_with(".app") {
        let mut c = Command::new("open");
        c.arg("-a").arg(&app).arg(&file);
        c
    } else {
        let mut c = Command::new(&app);
        c.arg(&file);
        c
    };
    cmd.spawn().map(|_| ()).map_err(|e| format!("Couldn’t open {app}: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            desktop_info,
            write_file,
            read_file,
            list_files,
            pick_folder,
            pick_file,
            reveal,
            open_default,
            find_slicers,
            open_with
        ])
        .run(tauri::generate_context!())
        .expect("error while running Contour and Gable");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_slicers() {
        assert_eq!(slicer_named("OrcaSlicer.app"), Some("OrcaSlicer"));
        assert_eq!(slicer_named("orca-slicer.exe"), Some("OrcaSlicer"));
        assert_eq!(slicer_named("UltiMaker-Cura.exe"), Some("UltiMaker Cura"));
        assert_eq!(slicer_named("UltiMaker Cura.app"), Some("UltiMaker Cura"));
        assert_eq!(slicer_named("ElegooSlicer.exe"), Some("ElegooSlicer"));
        assert_eq!(slicer_named("Bambu Studio.app"), Some("Bambu Studio"));
        assert_eq!(slicer_named("PrusaSlicer-2.9.2+linux-x64.AppImage"), Some("PrusaSlicer"));
        assert_eq!(slicer_named("CuraEngine.exe"), None);
        assert_eq!(slicer_named("notepad.exe"), None);
    }

    #[test]
    fn keeps_names_in_their_folder() {
        assert_eq!(safe_name("../../etc/passwd"), "-..-etc-passwd");
        assert_eq!(safe_name("My house.project.json"), "My house.project.json");
        assert_eq!(safe_name("a:b?.3mf"), "a-b-.3mf");
        assert_eq!(safe_name("..."), "file");
    }

    #[test]
    fn decodes_names() {
        assert_eq!(percent_decode("My%20house%E2%80%99s.3mf"), "My house’s.3mf");
        assert_eq!(percent_decode("100%"), "100%");
    }
}
