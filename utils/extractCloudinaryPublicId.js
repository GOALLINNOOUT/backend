// Extract Cloudinary publicId from a Cloudinary image URL
function extractCloudinaryPublicId(url) {
  // Example: https://res.cloudinary.com/dnhlivgbf/image/upload/v1752600917/perfumes/s2wtrikcswzhrqapmgtq.webp
  // publicId: perfumes/s2wtrikcswzhrqapmgtq
  if (!url) return null;
  const match = url.match(/\/upload\/[^\/]+\/(.+)\.[a-zA-Z0-9]+$/);
  return match ? match[1] : null;
}

module.exports = extractCloudinaryPublicId;
