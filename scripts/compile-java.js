import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const javaSrcDir = path.resolve(rootDir, 'java-service/src');
const javaBinDir = path.resolve(rootDir, 'java-service/bin');

if (!fs.existsSync(javaBinDir)) {
  fs.mkdirSync(javaBinDir, { recursive: true });
}

function findJavaFiles(dir) {
  let files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(findJavaFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.java')) {
      files.push(fullPath);
    }
  }
  return files;
}

const javaFiles = findJavaFiles(javaSrcDir);

if (javaFiles.length === 0) {
  console.log('⚠️ No Java files found to compile.');
  process.exit(0);
}

console.log(`☕ Compiling ${javaFiles.length} Java source files into ${javaBinDir}...`);

const result = spawnSync('javac', ['-d', javaBinDir, ...javaFiles], {
  cwd: rootDir,
  stdio: 'inherit'
});

if (result.error) {
  console.warn('⚠️ javac could not be invoked (is JDK installed & on PATH?). Continuing with existing class files if present.');
} else if (result.status !== 0) {
  console.error(`❌ Compilation failed with exit code ${result.status}`);
  process.exit(result.status || 1);
} else {
  console.log('✅ Java source files compiled successfully.');
}
