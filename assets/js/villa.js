async function loadVilla() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");

  if (!id) {
    document.getElementById("villa").innerHTML =
      "<p class='text-red-500'>Villa ID not found</p>";
    return;
  }

  const res = await fetch(`/.netlify/functions/villa?id=${id}`);
  const villa = await res.json();

  const container = document.getElementById("villa");

  const images = (villa.listingImages || [])
    .map(
      (img) => `
<img src="${img.url}" class="rounded-xl w-full h-72 object-cover">
`,
    )
    .join("");

  const amenities = (villa.amenities || [])
    .map((a) => `<span class="px-3 py-1 bg-gray-100 rounded">${a.name}</span>`)
    .join("");

  container.innerHTML = `

<h1 class="text-3xl font-bold mb-4">
${villa.name}
</h1>

<p class="text-gray-600 mb-6">

${villa.personCapacity ?? "-"} guests •
${villa.bedroomsNumber ?? "-"} bedrooms •
${villa.bathroomsNumber ?? "-"} bathrooms

</p>

<div class="grid md:grid-cols-2 gap-4 mb-8">

${images}

</div>

<p class="mb-8 text-gray-700 leading-relaxed">

${villa.description ?? ""}

</p>

<h2 class="text-xl font-semibold mb-3">
Amenities
</h2>

<div class="flex flex-wrap gap-2 mb-10">

${amenities}

</div>

<div class="border rounded-xl p-6">

<h2 class="text-xl font-semibold mb-4">
Check Availability
</h2>

<div class="grid md:grid-cols-3 gap-3 mb-4">

<input
type="date"
id="start"
class="border p-2 rounded"
>

<input
type="date"
id="end"
class="border p-2 rounded"
>

<input
type="number"
id="guests"
value="2"
class="border p-2 rounded"
>

</div>

<button
onclick="checkAvailability(${villa.id})"
class="bg-black text-white px-6 py-2 rounded hover:bg-gray-800"
>
Check Availability
</button>

<div id="availabilityResult" class="mt-4"></div>

</div>

`;
}

async function checkAvailability(villaId) {
  const start = document.getElementById("start").value;
  const end = document.getElementById("end").value;
  const guests = document.getElementById("guests").value;

  const res = await fetch(
    `/.netlify/functions/availability?start=${start}&end=${end}&guests=${guests}`,
  );

  const villas = await res.json();

  const available = villas.find((v) => v.id == villaId);

  const el = document.getElementById("availabilityResult");

  if (available) {
    el.innerHTML =
      "<p class='text-green-600 font-semibold'>Available for your dates ✓</p>";
  } else {
    el.innerHTML =
      "<p class='text-red-600 font-semibold'>Not available for these dates</p>";
  }
}

loadVilla();
