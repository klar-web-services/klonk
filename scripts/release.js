#!/usr/bin/env node

/**
 * This script helps create a new release by:
 * 1. Updating the version in package.json
 * 2. Creating a git tag
 * 3. Pushing the tag to GitHub, which triggers the publish workflow
 * 
 * Usage:
 * bun run scripts/release.js [patch|minor|major] [-m|--message "commit message"]
 */

import { exec } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function main() {
  try {
    // Ensure we're on the main branch
    const { stdout: branch } = await execAsync('git branch --show-current');
    if (branch.trim() !== 'main') {
      console.error('❌ Must be on main branch to release');
      process.exit(1);
    }

    // Ensure working directory is clean
    const { stdout: status } = await execAsync('git status --porcelain');
    if (status.trim() !== '') {
      console.error('❌ Working directory not clean. Commit or stash changes before releasing.');
      process.exit(1);
    }

    // Parse CLI arguments
    const args = process.argv.slice(2);
    const allowedReleaseTypes = ['patch', 'minor', 'major'];
    const releaseType = allowedReleaseTypes.includes(args[0]) ? args[0] : 'patch';
    if (!allowedReleaseTypes.includes(releaseType)) {
      console.error('❌ Invalid release type. Use: patch, minor, or major');
      process.exit(1);
    }

    // Optional commit message (-m | --message)
    let userCommitMessage = '';
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-m' || args[i] === '--message') {
        userCommitMessage = args[i + 1] || '';
        break;
      }
    }

    // Read the current version from package.json
    const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'));
    const currentVersion = packageJson.version;
    
    // Calculate the new version
    const versionParts = currentVersion.split('.').map(Number);
    if (releaseType === 'major') {
      versionParts[0] += 1;
      versionParts[1] = 0;
      versionParts[2] = 0;
    } else if (releaseType === 'minor') {
      versionParts[1] += 1;
      versionParts[2] = 0;
    } else {
      versionParts[2] += 1;
    }
    const newVersion = versionParts.join('.');
    
    // Update package.json
    packageJson.version = newVersion;
    writeFileSync('./package.json', JSON.stringify(packageJson, null, 2) + '\n');
    
    console.log(`📦 Updated version in package.json: ${currentVersion} → ${newVersion}`);
    
    // Commit the version change
    await execAsync(`git add package.json`);
    const commitMessage = userCommitMessage
      ? `${userCommitMessage} (${newVersion})`
      : `chore: bump version to ${newVersion}`;
    await execAsync(`git commit -m "${commitMessage}"`);
    console.log('✅ Committed version change');
    
    // Create the tag
    await execAsync(`git tag -a v${newVersion} -m "Release v${newVersion}"`);
    console.log(`🏷️ Created tag v${newVersion}`);
    
    // Push to GitHub
    console.log('🚀 Pushing to GitHub...');
    await execAsync('git push');
    await execAsync(`git push origin v${newVersion}`);
    
    // Get the remote URL to build the link to the actions page
    const { stdout: remoteUrl } = await execAsync('git config --get remote.origin.url');
    const match = remoteUrl.trim().match(/github\.com[/:]([^/]+)\/([^/]+)/);
    
    let actionsUrl = 'Could not determine repository URL. You can find the workflow in your repository Actions tab.'
    if(match) {
        const owner = match[1];
        const repo = match[2].replace('.git', '');
        actionsUrl = `https://github.com/${owner}/${repo}/actions`;
    }

    console.log(`
✨ Release v${newVersion} created successfully!
🔄 GitHub Actions will now build and publish the package.
📝 You can monitor the workflow at: ${actionsUrl}
    `);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main(); 