async function loadVillas() {
  const res = await fetch("/.netlify/functions/villas");
  const villas = await res.json();

  const container = document.getElementById("villas");

  container.innerHTML = "";

  villas.forEach((villa) => {
    const image =
      villa.listingImages?.[0]?.url || "https://placehold.co/600x400";

    const card = document.createElement("div");

    card.className =
      "bg-white rounded-xl shadow hover:shadow-xl transition cursor-pointer overflow-hidden";

    card.innerHTML = `

<img src="${image}" class="h-56 w-full object-cover">

<div class="p-4">

<h3 class="font-semibold text-lg mb-2">
${villa.name}
</h3>

<p class="text-sm text-gray-600">

${villa.personCapacity ?? "-"} guests •
${villa.bedroomsNumber ?? "-"} bedrooms •
${villa.bathroomsNumber ?? "-"} bathrooms

</p>

</div>

`;

    card.onclick = () => {
      window.location = `/villa/?id=${villa.id}`;
    };

    container.appendChild(card);
  });
}

loadVillas();
