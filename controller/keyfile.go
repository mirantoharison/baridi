package main

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"strings"

	"golang.org/x/sys/windows"
)

// keyFileName : fichier de la clé d'API, à côté de l'exécutable (comme settings.json et profiles.json).
const keyFileName = "api.key"

// keyBytes : taille de la clé en octets (256 bits), écrite en hexadécimal (64 caractères).
const keyBytes = 32

// keyACL : liste d'accès du fichier de clé — contrôle total pour SYSTEM (SY) et les administrateurs (BA), rien pour
// personne d'autre. « P » = protégée : elle n'hérite pas des droits du dossier parent, où un utilisateur ordinaire
// pourrait sinon avoir un droit de lecture (ex. Program Files).
const keyACL = "D:PAI(A;;FA;;;SY)(A;;FA;;;BA)"

// isValidKey vérifie le format d'une clé lue sur disque : 64 caractères hexadécimaux.
func isValidKey(k string) bool {
	if len(k) != keyBytes*2 {
		return false
	}
	_, err := hex.DecodeString(k)
	return err == nil
}

// restrictToAdmins réserve le fichier à SYSTEM et aux administrateurs (voir keyACL).
func restrictToAdmins(path string) error {
	sd, err := windows.SecurityDescriptorFromString(keyACL)
	if err != nil {
		return err
	}
	dacl, _, err := sd.DACL()
	if err != nil {
		return err
	}
	return windows.SetNamedSecurityInfo(path, windows.SE_FILE_OBJECT,
		windows.DACL_SECURITY_INFORMATION|windows.PROTECTED_DACL_SECURITY_INFORMATION, nil, nil, dacl, nil)
}

// loadOrCreateKey lit la clé d'API, ou en crée une aléatoire au premier démarrage.
//
// IMPORTANT :
//   - la clé est mémorisée (et non régénérée à chaque lancement) parce que le contrôleur peut tourner en service,
//     sans interface : celle-ci s'y connecte plus tard et doit retrouver la même clé ;
//   - à la création, le fichier est d'abord créé VIDE, puis verrouillé, puis rempli : la clé n'est jamais lisible
//     par un utilisateur ordinaire, même une fraction de seconde ;
//   - les droits sont réappliqués à chaque démarrage, même sur un fichier existant, au cas où ils auraient été
//     modifiés ; si on n'y arrive pas, on refuse de démarrer plutôt que de servir avec une clé exposée.
func loadOrCreateKey(path string) (string, error) {
	if data, err := os.ReadFile(path); err == nil {
		if key := strings.TrimSpace(string(data)); isValidKey(key) {
			if err := restrictToAdmins(path); err != nil {
				return "", fmt.Errorf("droits du fichier de clé: %w", err)
			}
			return key, nil
		}
		// Fichier présent mais illisible ou invalide : on le remplace par une clé neuve.
		if err := os.Remove(path); err != nil {
			return "", fmt.Errorf("fichier de clé invalide, suppression impossible: %w", err)
		}
	}

	buf := make([]byte, keyBytes)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("génération de la clé: %w", err)
	}
	key := hex.EncodeToString(buf)

	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return "", fmt.Errorf("création du fichier de clé: %w", err)
	}
	defer f.Close()
	if err := restrictToAdmins(path); err != nil {
		f.Close()
		os.Remove(path) // jamais de fichier de clé laissé avec des droits trop larges
		return "", fmt.Errorf("droits du fichier de clé: %w", err)
	}
	if _, err := f.WriteString(key); err != nil {
		return "", fmt.Errorf("écriture de la clé: %w", err)
	}
	return key, nil
}
