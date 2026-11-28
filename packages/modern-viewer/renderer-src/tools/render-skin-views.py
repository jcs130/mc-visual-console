"""Export a vanilla player's four worn views from a local PNG. Requires Playwright Chromium."""

import argparse
import base64
from pathlib import Path

from playwright.sync_api import sync_playwright


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("skin", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--model", choices=["slim", "classic"], required=True)
    parser.add_argument("--bundle", type=Path, default=Path(__file__).resolve().parents[1]
                        / "node_modules/skinview3d/bundles/skinview3d.bundle.js")
    args = parser.parse_args()
    pixels = args.skin.read_bytes()
    if pixels[:8] != b"\x89PNG\r\n\x1a\n":
        parser.error("Expected a PNG skin")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        page = browser.new_page()
        page.route("http**://**/*", lambda route: route.abort())
        page.add_script_tag(path=str(args.bundle))
        url = page.evaluate("""async ({skin, model}) => {
            const width = 256, height = 410;
            const viewer = new skinview3d.SkinViewer({
                width, height, renderPaused: true, preserveDrawingBuffer: true,
                enableControls: false, fov: 24, zoom: 0.94, pixelRatio: 1
            });
            try {
                await viewer.loadSkin(skin, {model: model === 'slim' ? 'slim' : 'default'});
                const body = viewer.playerObject.skin;
                body.setOuterLayerVisible(true);
                body.leftArm.rotation.z = 0.07;
                body.rightArm.rotation.z = -0.07;
                const result = document.createElement('canvas');
                const angles = [[8, '正面'], [86, '左侧'], [184, '背面'], [-86, '右侧']];
                result.width = width * angles.length;
                result.height = height + 40;
                const ctx = result.getContext('2d');
                ctx.fillStyle = '#323c49';
                ctx.fillRect(0, 0, result.width, result.height);
                ctx.textAlign = 'center';
                ctx.font = '600 19px "Microsoft YaHei", sans-serif';
                // Camera on +X sees the wearer's left. Rotate the body the opposite way.
                for (const [i, [degrees, label]] of angles.entries()) {
                    viewer.playerObject.rotation.y = -degrees * Math.PI / 180;
                    viewer.render();
                    ctx.drawImage(viewer.canvas, i * width, 0);
                    ctx.fillStyle = '#f3f4f5';
                    ctx.fillText(label, (i + 0.5) * width, height + 18);
                }
                return result.toDataURL('image/png');
            } finally {
                viewer.dispose();
            }
        }""", {"skin": "data:image/png;base64," + base64.b64encode(pixels).decode(),
               "model": args.model})
        browser.close()
    args.output.write_bytes(base64.b64decode(url.split(",", 1)[1], validate=True))


if __name__ == "__main__":
    main()
