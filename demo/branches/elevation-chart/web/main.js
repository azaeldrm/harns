const API = "http://localhost:8787/trails";

/** A trail's elevations as a small line chart, 120 by 28 px, lowest point at the bottom. */
function elevationChart(elevations) {
  const low = Math.min(...elevations), high = Math.max(...elevations);
  const points = elevations.map((e, i) => {
    const x = (i / (elevations.length - 1)) * 120;
    const y = 28 - ((e - low) / (high - low || 1)) * 28;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `<svg width="120" height="28"><polyline points="${points.join(" ")}" fill="none" stroke="#3a7d44" stroke-width="2"/></svg>`;
}

/** One trail as a list item: its name, its distance and climb, and its elevation chart. */
function trailItem(trail) {
  const li = document.createElement("li");
  li.innerHTML = `<strong>${trail.name}</strong> <span class="meta">${trail.km} km · ${trail.climb} m up</span>
    ${elevationChart(trail.elevations)}`;
  return li;
}

/** Loads the trails from the API and lists them, longest first. */
async function showTrails() {
  const trails = await (await fetch(API)).json();
  const list = document.getElementById("trails");
  trails.sort((a, b) => b.km - a.km).forEach(t => list.append(trailItem(t)));
}

showTrails();
