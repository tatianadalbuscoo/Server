
// Web framework for creating APIs and web servers
const express = require('express');

// Core Node module to create HTTP server
const http = require('http');

// Real-time communication via WebSockets
const socketIo = require('socket.io');

// MongoDB object modeling tool
const mongoose = require('mongoose');

// Loads environment variables from .env file
require('dotenv').config();

// Unique IDs
const registeredChairIds = [];

// Import the body-parser middleware to parse incoming request bodies (e.g. JSON, form data)
const bodyParser = require('body-parser');

// Import the CORS middleware to enable Cross-Origin Resource Sharing
const cors = require('cors');

// Import the path module to work with file and directory paths
const path = require('path');

// Initialize Express app
const app = express();

// Create HTTP server with Express app
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Set the MongoDB connection URI
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/smartchair';

// Initializes Socket.IO for real-time communication, allowing cross-origin requests via WebSockets
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Define the schema for posture data documents in MongoDB
// This schema describes how each document (record) is structured
const PostureDataSchema = new mongoose.Schema({
    chairId: String,
    timestamp: { type: Date, default: Date.now },
    sensors: [{ value: Number }],
    poseData: Object,
    postureStatus: String
});

// Create a Mongoose model called 'PostureData'
const PostureData = mongoose.model('PostureData', PostureDataSchema);

// Connect to MongoDB using Mongoose
mongoose.connect(MONGODB_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));

/*
* Registers a chair ID if it's not already present in the list
*
* parameters: id (string): The unique identifier of the chair to register
* return: void
*/
function registerChairId(id) {
    if (!registeredChairIds.includes(id)) {
        registeredChairIds.push(id);
        console.log(`New chair registered: ${id}`);
    }
}


/*
* Evaluates the posture based on pressure sensor data from the chair
*
* parameter: sensorData (Array): An array of objects, each with a `value` field representing pressure from one sensor
*
* return:
*   - string: The evaluated posture status, one of:
*       - 'not_sitting' if total pressure is very low
*       - 'poor' if there's a strong imbalance between left and right sides
*       - 'good' if posture is balanced and properly supported
*/
function evaluatePosture(sensorData) {
    const sensorValues = sensorData.map(s => s.value);
  
    // Check if weight distribution is balanced
    const leftSide = sensorValues[0] + sensorValues[2];
    const rightSide = sensorValues[1] + sensorValues[3];
  
    const difference = Math.abs(leftSide - rightSide);
    const totalWeight = sensorValues.reduce((sum, val) => sum + val, 0);

    // Calculate front and back weights
    const backWeight = sensorValues[0] + sensorValues[1];
    const frontWeight = sensorValues[2] + sensorValues[3];
  
    // If total weight is too low, person is not sitting
    if (totalWeight < 200) {
        return 'not_sitting';
    }

    // If the front end has much more weight than the back end, it is leaning forward.
    if (frontWeight > backWeight * 1.5) {
        return 'lean_forwarding';
    }
  
    // If imbalance exceeds 30% of total weight, posture is poor
    if (difference > totalWeight * 0.3) {
        return 'poor';
    }
  

    return 'good';
}


/*
* Analyzes PoseNet keypoints to determine posture quality
*
* parameter: keypoints (Array): List of keypoint objects detected by PoseNet, each with part, score, and position
* return: string: Posture status ('not_sitting', 'poor', or 'good')
*/
function analyzePoseNetPosture(keypoints) {

    // Extract relevant keypoints
    const nose = keypoints.find(kp => kp.part === 'nose');
    const leftShoulder = keypoints.find(kp => kp.part === 'leftShoulder');
    const rightShoulder = keypoints.find(kp => kp.part === 'rightShoulder');
    const leftEar = keypoints.find(kp => kp.part === 'leftEar');
    const rightEar = keypoints.find(kp => kp.part === 'rightEar');

    // Check if essential keypoints are present and reliable
    if (!nose || !leftShoulder || !rightShoulder ||
        nose.score < 0.3 || leftShoulder.score < 0.3 || rightShoulder.score < 0.3) {
        return 'not_sitting';
    }

    // Evaluate shoulder alignment
    const shoulderDiff = Math.abs(leftShoulder.position.y - rightShoulder.position.y);
    const shoulderDistance = Math.abs(leftShoulder.position.x - rightShoulder.position.x);

    if (shoulderDiff > shoulderDistance * 0.2) {
        return 'poor';
    }

    // Evaluate ear symmetry if both ears are detected reliably
    if (leftEar && rightEar && leftEar.score > 0.5 && rightEar.score > 0.5) {
        const earDiff = Math.abs(leftEar.position.y - rightEar.position.y);
        const earDistance = Math.abs(leftEar.position.x - rightEar.position.x);


        if (earDiff > earDistance * 0.3) {
            return 'poor';
        }
    }

    return 'good';
}


/////////////////////////////////// Routes


// Route to check if the server is running correctly (health check endpoint)
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running' });
});


// Endpoint to retrieve all registered chair IDs that have sent data recently
app.get('/api/chairids', async (req, res) => {
    try {
        // Define a time window (1 hour ago)
        const oneMinuteAgo = new Date(Date.now() - 3600 * 1000);

        // Query the database for unique chair IDs that have sent data within the last hour
        const activeChairIds = await PostureData.find({ timestamp: { $gte: oneMinuteAgo } })
            .distinct('chairId');

        // Respond with the list of active chair IDs
        res.json({ ids: activeChairIds });

    } catch (err) {
        console.error('Errore nella ricerca dei chairId attivi:', err);
        res.status(500).json({ error: 'Errore server' });
    }
});



// Endpoint to receive sensor data from the smart chair
app.post('/chair', async (req, res) => {
    try {
        console.log('Received chair data:');    // Debug

        const sensorData = req.body.sensors;
        const chairId = req.body.id || 'unknown';

        // Register the chair ID if it's not already tracked
        registerChairId(chairId);

        // Validate that sensorData is present and is an array
        if (!sensorData || !Array.isArray(sensorData)) {
            console.error('Invalid sensor data format:', req.body);
            return res.status(400).json({ error: 'Invalid sensor data format' });
        }

        // Analyze the posture using sensor values
        const postureStatus = evaluatePosture(sensorData);

        // Create a new document with the posture data
        const postureRecord = new PostureData({
            chairId,
            sensors: sensorData,
            postureStatus
        });

        // Save the data to MongoDB
        await postureRecord.save();

        io.emit('chairData', {
            chairId,
            sensors: sensorData,
            timestamp: new Date(),
            postureStatus,
            source: 'sensors'         // Identify data source as sensor-based
        });

        // Respond with success message and posture result
        res.status(200).json({
            message: 'Data received successfully',
            postureStatus
        });
    } catch (error) {
        console.error('Error processing chair data:', error);
        res.status(500).json({ error: 'Server error' });
    }
});


// Endpoint to receive posture data from PoseNet keypoints
app.post('/posenet', async (req, res) => {
    try {
        console.log('Received PoseNet data'); // Debug

        // Extract chair ID and PoseNet keypoints from the request body
        const { chairId, keypoints } = req.body;

        // Register the chair ID if not already known
        registerChairId(chairId);

        // Validate that keypoints data is provided and is an array
        if (!keypoints || !Array.isArray(keypoints)) {
            return res.status(400).json({ error: 'Invalid keypoints data' });
        }

        // Analyze posture based on the keypoints
        const posePosture = analyzePoseNetPosture(keypoints);

        // Create a new posture record and store it in MongoDB
        const postureRecord = new PostureData({
            chairId,
            poseData: { keypoints },
            postureStatus: posePosture
        });

        await postureRecord.save();

        io.emit('postureUpdate', {
            chairId,
            postureStatus: posePosture,
            hasPoseData: true,
            source: 'posenet',         // Indicates that the data came from PoseNet
            timestamp: new Date()
        });

        // Respond with a success message and posture evaluation
        res.json({
            message: 'PoseNet data received successfully',
            postureStatus: posePosture
        });
    } catch (error) {
        console.error('Error processing PoseNet data:', error);
        res.status(500).json({ error: 'Server error' });
    }
});


// Handle new WebSocket client connections
io.on('connection', (socket) => {
    console.log('Client connected');

    // Handle client disconnection
    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});


// Start the HTTP server and listen on the specified port
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


module.exports = {
    app,
    evaluatePosture,
    analyzePoseNetPosture
};


/*// Get historical posture data
app.get('/api/history/:chairId', async (req, res) => {
  try {
    const { chairId } = req.params;
    const { limit = 100, from, to } = req.query;

    const query = { chairId };

    if (from || to) {
      query.timestamp = {};
      if (from) query.timestamp.$gte = new Date(from);
      if (to) query.timestamp.$lte = new Date(to);
    }

    const history = await PostureData.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .select('-__v');

    res.json(history);
  } catch (error) {
    console.error('Error retrieving history:', error);
    res.status(500).json({ error: 'Server error' });
  }
});*/

