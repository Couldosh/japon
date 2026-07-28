module.exports = {
  content: [
    "./src/**/*.{html,ts}"
  ],
  corePlugins: {
    preflight: false, // IMPORTANT : évite que le reset Tailwind entre en conflit avec celui d'Ionic
  },
  theme: {
    extend: {},
  },
  plugins: [],
}
