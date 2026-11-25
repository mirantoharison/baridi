package main

import (
	"encoding/json"
	"os"

	"fanctl/fan"
)

// settings : préférences globales persistées à côté de l'exécutable (settings.json).
type settings struct {
	CurveMode string `json:"curve_mode"`
	// Profil actif au dernier arrêt : le service le retrouve au démarrage de la machine.
	Profile string `json:"profile"`
	// Réglages fins du pilotage auto (voir fan.SetTuning). Absents d'un ancien fichier → 0 et "" = valeurs neutres.
	HysteresisC int    `json:"hysteresis_c"`
	Smoothing   string `json:"smoothing"`
	TempFilterS int    `json:"temp_filter_s"`
	// Mode du second ventilateur : seul « follow » est mémorisé. « manual » ne l'est JAMAIS — une consigne fixe
	// oubliée ne doit pas se retrouver appliquée au prochain démarrage.
	Fan2Mode string `json:"fan2_mode"`
	// Courbe propre du second ventilateur (mode « curve ») et température qui pilote la courbe du ventilateur 1.
	Fan2Curve  fan.Fan2CurveConfig `json:"fan2_curve"`
	TempSource string              `json:"temp_source"`
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
