package fan

import "testing"

// La courbe lissée passe par ses points et ne dépasse jamais les vitesses des points voisins (pas de rebond).
func TestSmoothSpeedPassesThroughPointsAndStaysMonotone(t *testing.T) {
	pts := []CurvePoint{{Temp: 40, Speed: 20}, {Temp: 55, Speed: 45}, {Temp: 70, Speed: 70}, {Temp: 85, Speed: 100}}
	for _, p := range pts {
		if got := smoothSpeed(pts, float64(p.Temp)); got < float64(p.Speed)-0.001 || got > float64(p.Speed)+0.001 {
			t.Errorf("à %d°C attendu %d, obtenu %.2f", p.Temp, p.Speed, got)
		}
	}
	prev := -1.0
	for temp := 30.0; temp <= 100; temp += 0.5 {
		v := smoothSpeed(pts, temp)
		if v < prev-0.0001 {
			t.Fatalf("la courbe redescend à %.1f°C : %.2f après %.2f", temp, v, prev)
		}
		if v < 20 || v > 100 {
			t.Fatalf("dépassement à %.1f°C : %.2f", temp, v)
		}
		prev = v
	}
}

// Un palier (deux points de même vitesse) reste plat, sans bosse.
func TestSmoothSpeedFlatSegmentStaysFlat(t *testing.T) {
	pts := []CurvePoint{{Temp: 40, Speed: 30}, {Temp: 60, Speed: 30}, {Temp: 80, Speed: 90}}
	for temp := 40.0; temp <= 60; temp += 1 {
		if v := smoothSpeed(pts, temp); v < 29.999 || v > 30.001 {
			t.Fatalf("palier non plat à %.0f°C : %.3f", temp, v)
		}
	}
}
