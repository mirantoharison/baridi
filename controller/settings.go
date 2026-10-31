package main

import (
	"encoding/json"
	"os"
)

// settings : préférences globales persistées à côté de l'exécutable (settings.json).
type settings struct {
	CurveMode string `json:"curve_mode"`
	// Profil actif au dernier arrêt : le service le retrouve au démarrage de la machine.
	Profile string `json:"profile"`
}

func loadSettings(path string) settings {
	var s settings
	if data, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(data, &s) // fichier illisible → valeurs par défaut
	}
	return s
}

func saveSettings(path string, s settings) error {
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}
