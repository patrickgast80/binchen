// BIL-2483: probe live product thumbnails.
// (a) Is the canvas square with the Studio-Grey mat (#C8C8C6) to the very edge?
//     -> then any CSS padding under the image is a second frame (this ticket).
// (b) Does the photo itself still carry a bright backdrop rectangle inside the mat?
//     -> that is a pipeline finding for BIL-2462, not CSS.
import sharp from "sharp";

const res = await fetch("https://bilulu.de/catalog");
const html = await res.text();
const re = /https?:\\?\/\\?\/[^"\\ )]+?\.(?:jpg|jpeg|png|webp|svg)/gi;
const urls = [...new Set([...html.matchAll(re)].map((m) => m[0].replace(/\\/g, "")))];
const prod = urls.filter((u) => /static|uploads/.test(u));
console.log(`total img urls: ${urls.length}, product-ish: ${prod.length}\n`);

for (const u of prod) {
  try {
    const buf = Buffer.from(await (await fetch(u)).arrayBuffer());
    const img = sharp(buf);
    const meta = await img.metadata();
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
    const px = (x, y) => {
      const i = (y * info.width + x) * info.channels;
      return [data[i], data[i + 1], data[i + 2]];
    };
    const near = (p, t, tol) => p.every((v, i) => Math.abs(v - t[i]) <= tol);
    const GREY = [200, 200, 198];

    // Horizontal scanline through the vertical centre: classify each pixel as
    // mat-grey / bright-backdrop (>=235 on all channels) / product.
    const y = Math.floor(info.height / 2);
    let matL = 0;
    while (matL < info.width && near(px(matL, y), GREY, 4)) matL++;
    let bright = 0;
    let x = matL;
    while (x < info.width && px(x, y).every((v) => v >= 232)) {
      bright++;
      x++;
    }
    const pctMat = ((matL / info.width) * 100).toFixed(1);
    const pctBright = ((bright / info.width) * 100).toFixed(1);
    const corners = [
      px(1, 1),
      px(info.width - 2, 1),
      px(1, info.height - 2),
      px(info.width - 2, info.height - 2),
    ];
    const cornersOk = corners.every((c) => near(c, GREY, 3));
    console.log(
      `${u.split("/").pop().slice(0, 46)}  ${meta.width}x${meta.height}  ` +
        `corners=${cornersOk ? "GREY-ok" : corners.map((c) => c.join("/")).join(" ")}  ` +
        `mat=${pctMat}%  bright-backdrop-after-mat=${pctBright}%`,
    );
  } catch (e) {
    console.log(`${u} ERR ${e.message}`);
  }
}
