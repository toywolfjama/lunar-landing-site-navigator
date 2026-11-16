import fs from "node:fs";
const js = fs.readFileSync("dist/main.js", "utf8").replace(/<\/script/gi, "<\\/script");
const css = fs.readFileSync("src/styles.css", "utf8");
const moon = "data:image/jpeg;base64," + fs.readFileSync("assets/moon_lroc_1k.jpg").toString("base64");
const earth = "data:image/jpeg;base64," + fs.readFileSync("assets/earth_bluemarble_2k.jpg").toString("base64");
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lunar Landing Site Navigator</title>
<meta name="theme-color" content="#000000">
<meta name="description" content="Every Moon landing on a live, sunlit globe, and a planner for south-pole landing sites: sunlight, Earth contact and slope from NASA LRO data.">
<style>
${css}
</style>
</head>
<body>
<div id="root"></div>
<script>window.MOON_TEX = "${moon}"; window.EARTH_TEX = "${earth}";</script>
<script>
${js}
</script>
</body>
</html>
`;
fs.writeFileSync("index.html", html);
console.log("index.html", (html.length / 1024).toFixed(0), "KB");
