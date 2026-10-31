package fan

func PercentToPWM(percent uintptr) uintptr {
	if percent > 100 {
		percent = 100
	}
	return percent * 255 / 100
}

func Curve(temp uintptr) uintptr {
	var percent uintptr
	switch {
	case temp < 35:
		percent = 10
	case temp < 40:
		percent = 20
	case temp < 45:
		percent = 30
	case temp < 50:
		percent = 40
	case temp < 55:
		percent = 50
	case temp < 60:
		percent = 60
	case temp < 65:
		percent = 70
	case temp < 70:
		percent = 80
	case temp < 75:
		percent = 90
	default:
		percent = 100
	}
	return PercentToPWM(percent)
}
