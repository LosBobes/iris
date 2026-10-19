package store

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/png"
	"math"
)

// demoLoginLogoPNG draws the demo organization's sign-in logo: three
// overlapping process-color circles (cyan, magenta, yellow) on a transparent
// background, the print shop's classic mark. It is generated rather than
// shipped as a file so the seed has no binary asset to keep in sync, and it
// is returned base64-encoded as PUT /settings/login-logo expects.
func demoLoginLogoPNG() (string, error) {
	const size = 192
	img := image.NewNRGBA(image.Rect(0, 0, size, size))
	type circle struct {
		cx, cy, r float64
		color     color.NRGBA
	}
	circles := []circle{
		{size * 0.38, size * 0.40, size * 0.30, color.NRGBA{R: 0, G: 174, B: 239, A: 255}}, // cyan
		{size * 0.62, size * 0.40, size * 0.30, color.NRGBA{R: 236, G: 0, B: 140, A: 255}}, // magenta
		{size * 0.50, size * 0.62, size * 0.30, color.NRGBA{R: 255, G: 241, B: 0, A: 255}}, // yellow
	}
	const alpha = 0.78 // translucent so the overlaps mix like inks
	for y := 0; y < size; y++ {
		for x := 0; x < size; x++ {
			var r, g, b, a float64
			for _, c := range circles {
				dx, dy := float64(x)+0.5-c.cx, float64(y)+0.5-c.cy
				// 1px anti-aliased edge.
				coverage := c.r + 0.5 - math.Sqrt(dx*dx+dy*dy)
				if coverage <= 0 {
					continue
				}
				if coverage > 1 {
					coverage = 1
				}
				ca := coverage * alpha
				// Source-over compositing in straight alpha.
				outA := ca + a*(1-ca)
				if outA == 0 {
					continue
				}
				r = (float64(c.color.R)*ca + r*a*(1-ca)) / outA
				g = (float64(c.color.G)*ca + g*a*(1-ca)) / outA
				b = (float64(c.color.B)*ca + b*a*(1-ca)) / outA
				a = outA
			}
			img.SetNRGBA(x, y, color.NRGBA{R: uint8(r + 0.5), G: uint8(g + 0.5), B: uint8(b + 0.5), A: uint8(a*255 + 0.5)})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(buf.Bytes()), nil
}
