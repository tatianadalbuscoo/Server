
// Import 'spawn' to run child processes and 'path' to handle file paths
const { spawn } = require('child_process');
const path = require('path');

console.log('Starting Smart Chair IoT Server...');

// Launch a child process to check MongoDB connection
const mongoCheck = spawn('node', ['-e', `
  const mongoose = require('mongoose');
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/smartchair', { serverSelectionTimeoutMS: 5000 })
    .then(() => {
      console.log('MongoDB is accessible');
      require('child_process').spawn('node', [path.join(__dirname, 'server', 'server.js')], {
        stdio: 'inherit',
        env: { ...process.env }
      });
}
    )
    .catch(err => {
      console.error('MongoDB connection error:', err.message);
      console.log('');
      console.log('Make sure MongoDB is running. You can start it with:');
      console.log('docker-compose up -d');
      process.exit(1);
    });
`]);

// Handle and print stdout from the MongoDB check process
mongoCheck.stdout.on('data', (data) => {
  console.log(data.toString().trim());
});

// Handle and print stderr (errors) from the MongoDB check process
mongoCheck.stderr.on('data', (data) => {
  console.error(data.toString().trim());
});