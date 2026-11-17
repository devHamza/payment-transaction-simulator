import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// viteSingleFile inlines JS/CSS so `dist/index.html` can be opened or hosted as one file.
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
});
