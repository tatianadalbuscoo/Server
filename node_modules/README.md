# Smart Chair - IoT Posture Analysis Project

An IoT project that uses pressure sensors on a chair and computer vision (PoseNet) to analyze and improve sitting posture.

## Features

- Real-time posture monitoring using pressure sensors (FSR)
- Computer vision posture analysis using PoseNet
- Web interface with real-time feedback
- Historical data analysis
- MongoDB database for data storage
- Elegant UI design with EB Garamond font

## System Architecture

1. **ESP32 with FSR sensors** - Collects pressure data from the chair
2. **Node.js Express Server** - Processes data from ESP32 and PoseNet
3. **PoseNet** - Computer vision for posture detection
4. **MongoDB** - Stores historical posture data
5. **Web Interface** - Provides feedback and historical analysis

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (or Docker for containerized setup)
- ESP32 with FSR sensors configured
- Webcam for PoseNet functionality

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/smart-chair.git
cd smart-chair
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file with the following variables:

```
PORT=3000
MONGODB_URI=mongodb://localhost:27017/smartchair
```

### 4. Start MongoDB (using Docker)

```bash
docker-compose up -d
```

This will start both MongoDB and MongoDB Express (a web interface for MongoDB).
- MongoDB will be available at `mongodb://localhost:27017`
- MongoDB Express will be available at `http://localhost:8081`

### 5. Start the server

```bash
node server/server.js
```

The web interface will be available at `http://localhost:3000`

## ESP32 Configuration

The ESP32 code is included in the `arduino` folder. It requires the following libraries:
- WiFi
- WebServer
- HTTPClient

Follow these steps to set up the ESP32:

1. Open the `arduino/wifi_connection.ino` file in Arduino IDE
2. Configure your WiFi credentials in the code
3. Upload the code to your ESP32
4. Connect the FSR sensors to the ESP32 following the pin configuration in the code

## Using the System

1. Ensure the ESP32 is powered and connected to WiFi
2. Start the Node.js server
3. Open `http://localhost:3000` in your browser
4. Grant camera permissions if you want to use PoseNet analysis
5. The system will begin analyzing posture immediately

## Project Structure

```
smart-chair/
├── arduino/                  # ESP32 code
│   └── wifi_connection.ino   # Main ESP32 sketch
├── public/                   # Web interface files
│   ├── css/                  # Stylesheets
│   │   └── style.css         # Main CSS file
│   ├── js/                   # JavaScript files
│   │   ├── chair.js          # Chair sensor visualization
│   │   ├── main.js           # Main application logic
│   │   ├── posenet.js        # PoseNet integration
│   │   └── history.js        # Historical data display
│   └── index.html            # Main web page
├── server/                   # Server-side code
│   └── server.js             # Express server and API
├── docker-compose.yml        # Docker configuration
├── .env                      # Environment variables
└── package.json              # Node.js dependencies
```
