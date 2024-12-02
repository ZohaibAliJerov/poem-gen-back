const path = require('path');
const fs = require('fs');

function ensureDirectories() {
    // Define directories that need to exist
    const directories = [
        'dist',
        'dist/routes',
        'dist/models',
        'dist/middleware',
        'dist/utils',
        'dist/config'
    ];

    // Create directories if they don't exist
    directories.forEach(dir => {
        const fullPath = path.join(process.cwd(), dir);
        if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
        }
    });
}

function copyFiles() {
    // Copy necessary files to dist
    const filesToCopy = [
        { src: 'src/app.js', dest: 'dist/app.js' },
        { src: 'src/server.js', dest: 'dist/server.js' },
        { src: 'package.json', dest: 'dist/package.json' },
        { src: 'package-lock.json', dest: 'dist/package-lock.json' }
    ];

    filesToCopy.forEach(file => {
        fs.copyFileSync(
            path.join(process.cwd(), file.src),
            path.join(process.cwd(), file.dest)
        );
    });
}

// Execute build steps
ensureDirectories();
copyFiles();
console.log('✅ Build completed successfully!');