// netlify/functions/villa-details.js
// This function fetches villa details - in production, you'd query your CMS or Hostaway
exports.handler = async (event) => {
  const { listingId } = event.queryStringParameters;

  // Map of listing IDs to villa details (expand as needed)
  const villaMap = {
    319475: {
      name: "Villa Indah",
      description: "A cozy tropical retreat in Ungasan with a private pool",
      maxGuests: 4,
      bedrooms: 2,
      bathrooms: 2,
      image: "/assets/images/villas/villa-indah/villa-indah-terrace-koi-fish-pond.webp",
    },
    319476: {
      name: "Villa Asmara",
      description: "A private tropical retreat in Ungasan with traditional Balinese charm",
      maxGuests: 4,
      bedrooms: 2,
      bathrooms: 2,
      image: "/assets/images/villas/villa-asmara/villa-asmara-exterior-pool-lawn.webp",
    },
  };

  const villa = villaMap[listingId] || {
    name: "Luxury Villa",
    description: "Beautiful luxury villa in Bali",
    maxGuests: 6,
    bedrooms: 3,
    bathrooms: 3,
    image: "",
  };

  return {
    statusCode: 200,
    headers: {
      "Cache-Control": "public, max-age=300",
    },
    body: JSON.stringify({
      success: true,
      listing: villa,
    }),
  };
};
