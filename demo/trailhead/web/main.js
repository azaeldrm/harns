const API = "http://localhost:8787/trails";

/** One trail as a list item: its name, then its distance and climb. */
function trailItem(trail) {
  const li = document.createElement("li");
  li.innerHTML = `<strong>${trail.name}</strong> <span class="meta">${trail.km} km · ${trail.climb} m up</span>`;
  return li;
}

/** Loads the trails from the API and lists them, longest first. */
async function showTrails() {
  const trails = await (await fetch(API)).json();
  const list = document.getElementById("trails");
  trails.sort((a, b) => b.km - a.km).forEach(t => list.append(trailItem(t)));
}

showTrails();
