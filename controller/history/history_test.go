package history

import (
	"path/filepath"
	"testing"
	"time"
)

// Une dérive de vitesse de 20 % à consigne égale entre le début et la fin doit être signalée ; sans dérive, non.
func TestFouling(t *testing.T) {
	for _, tc := range []struct {
		name      string
		drop      float64
		wantState string
	}{{"propre", 0, "ok"}, {"a surveiller", 0.14, "watch"}, {"encrasse", 0.25, "clean"}} {
		t.Run(tc.name, func(t *testing.T) {
			st, err := Open(filepath.Join(t.TempDir(), "h.jsonl"))
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(st.Close)
			start := time.Now().Add(-8 * 24 * time.Hour).Unix()
			for i := 0; i < 8*24*120; i++ { // une mesure toutes les 30 s pendant 8 jours
				frac := float64(i) / float64(8*24*120)
				rpm := 4000 * (1 - tc.drop*frac)
				st.Add(Sample{T: start + int64(i)*30, Percent: 45, RPM: int(rpm)})
			}
			got := st.AnalyzeFouling()
			if got.Status != tc.wantState {
				t.Fatalf("statut %q (baisse %.1f%%), attendu %q", got.Status, got.DropPercent, tc.wantState)
			}
		})
	}
}

// Trop peu d'historique : aucun verdict.
func TestFoulingInsufficient(t *testing.T) {
	st, _ := Open(filepath.Join(t.TempDir(), "h.jsonl"))
	t.Cleanup(st.Close)
	now := time.Now().Unix()
	for i := 0; i < 100; i++ {
		st.Add(Sample{T: now - int64(100-i)*30, Percent: 45, RPM: 4000})
	}
	if got := st.AnalyzeFouling(); got.Status != "insufficient" {
		t.Fatalf("statut %q, attendu insufficient", got.Status)
	}
}

// La réduction ne dépasse jamais le nombre de points demandé et garde l'ordre chronologique.
func TestQueryDownsample(t *testing.T) {
	st, _ := Open(filepath.Join(t.TempDir(), "h.jsonl"))
	t.Cleanup(st.Close)
	now := time.Now().Unix()
	for i := 0; i < 5000; i++ {
		st.Add(Sample{T: now - int64(5000-i)*30, Temp: 50 + i%10, RPM: 3000})
	}
	out := st.Query(48*time.Hour, 200)
	if len(out) > 201 || len(out) < 100 {
		t.Fatalf("%d points", len(out))
	}
	for i := 1; i < len(out); i++ {
		if out[i].T <= out[i-1].T {
			t.Fatal("ordre rompu")
		}
	}
}
