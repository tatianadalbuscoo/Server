
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


const registeredChairIds = []; // Qui salveremo gli ID univoci


const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

// Initialize Express app and HTTP server
const app = express();
const server = http.createServer(app); // Create HTTP server with Express app

const io = socketIo(server, {
    cors: {
        origin: "*", // O metti l'origine specifica come 
        methods: ["GET", "POST"]
    }
});

function registerChairId(id) {
    if (!registeredChairIds.includes(id)) {
        registeredChairIds.push(id);
        console.log(`New chair registered: ${id}`);
    }
}


// Middleware
app.use(cors());
app.use(bodyParser.json());

// Set the MongoDB connection URI (from env or default to localhost)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/smartchair';

// Connect to MongoDB using Mongoose
mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Define the schema for posture data documents
const PostureDataSchema = new mongoose.Schema({
  chairId: String,
  timestamp: { type: Date, default: Date.now }, // When the data was recorded
  sensors: [{ value: Number }],
  poseData: Object,
  postureStatus: String
});

const PostureData = mongoose.model('PostureData', PostureDataSchema);

// Evaluate posture based on sensor data




function evaluatePosture(sensorData, poseData = null) {
  const sensorValues = sensorData.map(s => s.value);
  
  // Check if weight distribution is balanced
  const leftSide = sensorValues[0] + sensorValues[2];
  const rightSide = sensorValues[1] + sensorValues[3];
  
  const difference = Math.abs(leftSide - rightSide);
  const totalWeight = sensorValues.reduce((sum, val) => sum + val, 0);
  
  // If total weight is too low, person is not sitting
  if (totalWeight < 200) {
    return 'not_sitting';
  }
  
  // If imbalance exceeds 30% of total weight, posture is poor
  if (difference > totalWeight * 0.3) {
    return 'poor';
  }
  
  // Check if weight is distributed toward the back (good support)
  const backWeight = sensorValues[2] + sensorValues[3];
  const frontWeight = sensorValues[0] + sensorValues[1];
  
  if (backWeight < frontWeight * 0.8) {
    return 'leaning_forward';
  }

  return 'good';
}

// Function to analyze posture from PoseNet keypoints
function analyzePoseNetPosture(keypoints) {
    const nose = keypoints.find(kp => kp.part === 'nose');
    const leftShoulder = keypoints.find(kp => kp.part === 'leftShoulder');
    const rightShoulder = keypoints.find(kp => kp.part === 'rightShoulder');
    const leftEar = keypoints.find(kp => kp.part === 'leftEar');
    const rightEar = keypoints.find(kp => kp.part === 'rightEar');

    if (!nose || !leftShoulder || !rightShoulder ||
        nose.score < 0.3 || leftShoulder.score < 0.3 || rightShoulder.score < 0.3) {
        return 'not_sitting';
    }

    const shoulderDiff = Math.abs(leftShoulder.position.y - rightShoulder.position.y);
    const shoulderDistance = Math.abs(leftShoulder.position.x - rightShoulder.position.x);


    if (shoulderDiff > shoulderDistance * 0.2) {
        return 'poor';
    }

    const shoulderCenterY = (leftShoulder.position.y + rightShoulder.position.y) / 2;
    const headForwardRatio = (nose.position.y - shoulderCenterY) / shoulderDistance;


    // Applica controllo SOLO se le spalle sono abbastanza larghe
    /*if (shoulderDistance > 80 && headForwardRatio < -0.6) {
        return 'leaning_forward';
    }*/

    if (leftEar && rightEar && leftEar.score > 0.5 && rightEar.score > 0.5) {
        const earDiff = Math.abs(leftEar.position.y - rightEar.position.y);
        const earDistance = Math.abs(leftEar.position.x - rightEar.position.x);


        if (earDiff > earDistance * 0.3) {
            return 'poor';
        }
    }

    return 'good';
}


// Routes

// Route to check if the server is running correctly (health check endpoint)
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running' });
});
// Endpoint per ottenere gli ID sedia registrati
app.get('/api/chairids', async (req, res) => {
    try {
        const oneMinuteAgo = new Date(Date.now() - 3600 * 1000);

        // Ottieni gli ID con dati recenti dal DB
        const activeChairIds = await PostureData.find({ timestamp: { $gte: oneMinuteAgo } })
            .distinct('chairId');



        res.json({ ids: activeChairIds });
    } catch (err) {
        console.error('Errore nella ricerca dei chairId attivi:', err);
        res.status(500).json({ error: 'Errore server' });
    }
});

app.post('/chair', async (req, res) => {
    try {
        console.log('Received chair data:'/*, req.body*/);

        const sensorData = req.body.sensors;
        const chairId = req.body.id || 'unknown';

        // Registra l'ID se non � gi� presente
        registerChairId(chairId);

        if (!sensorData || !Array.isArray(sensorData)) {
            console.error('Invalid sensor data format:', req.body);
            return res.status(400).json({ error: 'Invalid sensor data format' });
        }

        const postureStatus = evaluatePosture(sensorData);

        const postureRecord = new PostureData({
            chairId,
            sensors: sensorData,
            postureStatus
        });

        await postureRecord.save();

        // Invia solo ai client iscritti a questa sedia
        io.emit('chairData', {
            chairId,
            sensors: sensorData,
            timestamp: new Date(),
            postureStatus,
            source: 'sensors'         // <--- AGGIUNGI QUESTO
        });


        res.status(200).json({
            message: 'Data received successfully',
            postureStatus
        });
    } catch (error) {
        console.error('Error processing chair data:', error);
        res.status(500).json({ error: 'Server error' });
    }
});



app.post('/posenet', async (req, res) => {
    try {
        console.log('Received PoseNet data');

        const { chairId, keypoints } = req.body;

        registerChairId(chairId);

        if (!keypoints || !Array.isArray(keypoints)) {
            return res.status(400).json({ error: 'Invalid keypoints data' });
        }

        const posePosture = analyzePoseNetPosture(keypoints);

        const postureRecord = new PostureData({
            chairId,
            poseData: { keypoints },
            postureStatus: posePosture
        });

        await postureRecord.save();

        // Invia solo ai client iscritti a questa sedia
        io.emit('postureUpdate', {
            chairId,
            postureStatus: posePosture,
            hasPoseData: true,
            source: 'posenet',         // <--- AGGIUNGI QUESTO
            timestamp: new Date()
        });


        res.json({
            message: 'PoseNet data received successfully',
            postureStatus: posePosture
        });
    } catch (error) {
        console.error('Error processing PoseNet data:', error);
        res.status(500).json({ error: 'Server error' });
    }
});



// Get historical posture data
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
});

io.on('connection', (socket) => {
    console.log('Client connected');

    // Il client sceglie una sedia a cui iscriversi
    /*socket.on('subscribeToChair', (chairId) => {
        console.log(`Client subscribed to ${chairId}`);
        socket.join(chairId);
    });

    // Riceve dati PoseNet via socket invece che via POST
    /*socket.on('poseData', async (data) => {
        try {
            console.log('Received PoseNet data via Socket.IO');

            const { chairId, keypoints } = data;
            registerChairId(chairId);

            if (!keypoints || !Array.isArray(keypoints)) {
                console.error('Invalid keypoints data received via socket');
                return;
            }

            const posePosture = analyzePoseNetPosture(keypoints);

            const postureRecord = new PostureData({
                chairId,
                poseData: { keypoints },
                postureStatus: posePosture
            });

            await postureRecord.save();

            // Invia solo ai client nella stanza giusta
            io.to(chairId).emit('postureUpdate', {
                chairId,
                postureStatus: posePosture,
                hasPoseData: true,
                timestamp: new Date()
            });

        } catch (error) {
            console.error('Error processing PoseNet data via socket:', error);
        }
    });*/

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});


// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});



