package hw

import (
	"bytes"
	"errors"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"unsafe"
)

var (
	shell32            = syscall.NewLazyDLL("shell32.dll")
	user32             = syscall.NewLazyDLL("user32.dll")
	gdi32              = syscall.NewLazyDLL("gdi32.dll")
	procSHGetFileInfoW = shell32.NewProc("SHGetFileInfoW")
	procDrawIconEx     = user32.NewProc("DrawIconEx")
	procDestroyIcon    = user32.NewProc("DestroyIcon")
	procCreateCompDC   = gdi32.NewProc("CreateCompatibleDC")
	procCreateDIBSect  = gdi32.NewProc("CreateDIBSection")
	procSelectObject   = gdi32.NewProc("SelectObject")
	procDeleteObject   = gdi32.NewProc("DeleteObject")
	procDeleteDC       = gdi32.NewProc("DeleteDC")
)

const (
	shgfiIcon      = 0x100
	shgfiLargeIcon = 0x0 // 32×32
	diNormal       = 0x3
	iconSize       = 32
)

type shFileInfo struct {
	HIcon         uintptr
	IIcon         int32
	DwAttributes  uint32
	SzDisplayName [260]uint16
	SzTypeName    [80]uint16
}

type bitmapInfoHeader struct {
	Size          uint32
	Width, Height int32
	Planes        uint16
	BitCount      uint16
	Compression   uint32
	SizeImage     uint32
	XPels, YPels  int32
	ClrUsed       uint32
	ClrImportant  uint32
}

// renderIcon dessine l'icône sur un fond uni (bg = 0 noir, 255 blanc) et renvoie les pixels BGRA bruts.
func renderIcon(hIcon uintptr, bg byte) ([]byte, error) {
	dc, _, _ := procCreateCompDC.Call(0)
	if dc == 0 {
		return nil, errors.New("CreateCompatibleDC")
	}
	defer procDeleteDC.Call(dc)

	bmi := bitmapInfoHeader{Size: uint32(unsafe.Sizeof(bitmapInfoHeader{})), Width: iconSize, Height: -iconSize, Planes: 1, BitCount: 32}
	var bits unsafe.Pointer
	bmp, _, _ := procCreateDIBSect.Call(dc, uintptr(unsafe.Pointer(&bmi)), 0, uintptr(unsafe.Pointer(&bits)), 0, 0)
	if bmp == 0 || bits == nil {
		return nil, errors.New("CreateDIBSection")
	}
	defer procDeleteObject.Call(bmp)
	old, _, _ := procSelectObject.Call(dc, bmp)
	defer procSelectObject.Call(dc, old)

	buf := unsafe.Slice((*byte)(bits), iconSize*iconSize*4)
	for i := 0; i < len(buf); i += 4 {
		buf[i], buf[i+1], buf[i+2], buf[i+3] = bg, bg, bg, 255
	}
	if r, _, _ := procDrawIconEx.Call(dc, 0, 0, hIcon, iconSize, iconSize, 0, 0, diNormal); r == 0 {
		return nil, errors.New("DrawIconEx")
	}
	out := make([]byte, len(buf))
	copy(out, buf)
	return out, nil
}

// extractIconPNG lit l'icône d'un exécutable et la renvoie en PNG 32×32 avec transparence.
//
// IMPORTANT : GDI ne donne pas directement un canal alpha fiable. On dessine donc l'icône deux fois, sur noir puis sur
// blanc ; la différence entre les deux dit l'opacité de chaque pixel (alpha = 255 − écart), et la couleur d'origine se
// déduit du rendu sur noir. Cela marche pour les icônes à transparence progressive comme pour les anciennes à masque.
func extractIconPNG(exePath string) ([]byte, error) {
	p, err := syscall.UTF16PtrFromString(exePath)
	if err != nil {
		return nil, err
	}
	var info shFileInfo
	r, _, _ := procSHGetFileInfoW.Call(uintptr(unsafe.Pointer(p)), 0, uintptr(unsafe.Pointer(&info)), unsafe.Sizeof(info), shgfiIcon|shgfiLargeIcon)
	if r == 0 || info.HIcon == 0 {
		return nil, errors.New("pas d'icône")
	}
	defer procDestroyIcon.Call(info.HIcon)

	onBlack, err := renderIcon(info.HIcon, 0)
	if err != nil {
		return nil, err
	}
	onWhite, err := renderIcon(info.HIcon, 255)
	if err != nil {
		return nil, err
	}
	img := image.NewNRGBA(image.Rect(0, 0, iconSize, iconSize))
	for i := 0; i < iconSize*iconSize; i++ {
		b0, g0, r0 := int(onBlack[i*4]), int(onBlack[i*4+1]), int(onBlack[i*4+2])
		b1, g1, r1 := int(onWhite[i*4]), int(onWhite[i*4+1]), int(onWhite[i*4+2])
		alpha := 255 - ((r1-r0)+(g1-g0)+(b1-b0))/3
		if alpha <= 0 {
			continue // transparent
		}
		if alpha > 255 {
			alpha = 255
		}
		un := func(c int) uint8 { // retire la prémultiplication par l'opacité
			v := c * 255 / alpha
			if v > 255 {
				v = 255
			}
			return uint8(v)
		}
		img.SetNRGBA(i%iconSize, i/iconSize, color.NRGBA{R: un(r0), G: un(g0), B: un(b0), A: uint8(alpha)})
	}
	var out bytes.Buffer
	if err := png.Encode(&out, img); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

var iconState struct {
	mu     sync.Mutex
	dir    string
	failed map[string]bool
}

// SetIconCacheDir indique où garder les icônes extraites (créé au besoin).
func SetIconCacheDir(dir string) {
	iconState.mu.Lock()
	iconState.dir, iconState.failed = dir, map[string]bool{}
	iconState.mu.Unlock()
	_ = os.MkdirAll(dir, 0o755)
}

// cacheFileName : le nom de l'exécutable devient un nom de fichier sûr (le nom vient d'une liste connue, mais on ne
// fait jamais confiance à une chaîne pour fabriquer un chemin).
func cacheFileName(name string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(name) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '.' || r == '-' || r == '_' {
			b.WriteRune(r)
		} else {
			b.WriteByte('_')
		}
	}
	return b.String() + ".png"
}

// AppIcon renvoie l'icône PNG d'un programme de la liste. Elle est extraite une seule fois puis gardée sur disque :
// les demandes suivantes (et les redémarrages) ne coûtent qu'une lecture de fichier.
func AppIcon(name string) ([]byte, error) {
	name = strings.ToLower(name)
	iconState.mu.Lock()
	dir, failed := iconState.dir, iconState.failed[name]
	iconState.mu.Unlock()
	if dir == "" {
		return nil, errors.New("cache d'icônes non configuré")
	}
	file := filepath.Join(dir, cacheFileName(name))
	if data, err := os.ReadFile(file); err == nil {
		return data, nil
	}
	if failed {
		return nil, errors.New("pas d'icône")
	}
	path := AppPath(name)
	if path == "" {
		return nil, errors.New("programme inconnu")
	}
	data, err := extractIconPNG(path)
	if err != nil {
		iconState.mu.Lock()
		iconState.failed[name] = true // inutile de réessayer jusqu'au prochain redémarrage
		iconState.mu.Unlock()
		return nil, err
	}
	_ = os.WriteFile(file, data, 0o644)
	return data, nil
}
