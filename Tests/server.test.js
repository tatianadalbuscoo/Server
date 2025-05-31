
const request = require('supertest');
const { app, evaluatePosture, analyzePoseNetPosture } = require('../server/server');

///////////////////////////////////////// evaluatePosture() function tests
describe('evaluatePosture', () => {

    // Test: should return "not_sitting" when pressure is too low
    test('should return "not_sitting" when total pressure is too low', () => {
        const result = evaluatePosture([{ value: 10 }, { value: 20 }, { value: 30 }, { value: 40 }]);
        expect(result).toBe('not_sitting');
    });

    // Test: should return "poor" for unbalanced pressure
    test('should return "poor" when weight is imbalanced', () => {
        const result = evaluatePosture([{ value: 100 }, { value: 10 }, { value: 100 }, { value: 10 }]);
        expect(result).toBe('poor');
    });

    // Test: should return "good" for balanced posture
    test('should return "good" when weight is evenly distributed', () => {
        const result = evaluatePosture([{ value: 100 }, { value: 100 }, { value: 100 }, { value: 100 }]);
        expect(result).toBe('good');
    });
});


///////////////////////////////////////// analyzePoseNetPosture() function tests


describe('analyzePoseNetPosture', () => {

    // Test: should return "not_sitting" if scores are too low
    test('should return "not_sitting" if keypoint scores are too low', () => {
        const result = analyzePoseNetPosture([
            { part: 'nose', score: 0.2, position: { x: 0, y: 0 } },
            { part: 'leftShoulder', score: 0.2, position: { x: 0, y: 0 } },
            { part: 'rightShoulder', score: 0.2, position: { x: 0, y: 0 } }
        ]);
        expect(result).toBe('not_sitting');
    });

    // Test: should return "good" if alignment is proper
    test('should return "good" when posture is well aligned', () => {
        const result = analyzePoseNetPosture([
            { part: 'nose', score: 0.9, position: { x: 0, y: 0 } },
            { part: 'leftShoulder', score: 0.9, position: { x: 100, y: 200 } },
            { part: 'rightShoulder', score: 0.9, position: { x: 200, y: 200 } },
            { part: 'leftEar', score: 0.9, position: { x: 90, y: 100 } },
            { part: 'rightEar', score: 0.9, position: { x: 210, y: 100 } }
        ]);
        expect(result).toBe('good');
    });
});

///////////////////////////////////////// GET /api/health

describe('API /api/health', () => {

    // Test: should return 200 with status message
    test('should return 200 with status message', async () => {
        const res = await request(app).get('/api/health');
        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe('Server is running');
    });
});


///////////////////////////////////////// GET /api/chairids


describe('API /api/chairids', () => {

    // Test: should return an array (can be empty)
    test('should return an array of chairId strings', async () => {
        const res = await request(app).get('/api/chairids');
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body.ids)).toBe(true);
    });
});


///////////////////////////////////////// POST /chair


describe('API POST /chair', () => {

    // Test: should return 400 if sensor data is missing
    test('should return 400 if sensor data is missing', async () => {
        const res = await request(app)
            .post('/chair')
            .send({ id: 'test-chair-no-sensors' }); // no 'sensors'
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe('Invalid sensor data format');
    });

    // Test: should accept valid data and return postureStatus
    test('should return 200 and postureStatus for valid sensor data', async () => {
        const res = await request(app)
            .post('/chair')
            .send({
                id: 'test-chair-123',
                sensors: [{ value: 100 }, { value: 100 }, { value: 100 }, { value: 100 }]
            });
        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('message', 'Data received successfully');
        expect(['good', 'poor', 'not_sitting']).toContain(res.body.postureStatus);
    });
});


///////////////////////////////////////// POST /posenet


describe('API POST /posenet', () => {

    // Test: should return 400 if keypoints are missing
    test('should return 400 if keypoints are missing', async () => {
        const res = await request(app)
            .post('/posenet')
            .send({ chairId: 'test-chair' }); // manca keypoints
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe('Invalid keypoints data');
    });

    // Test: should return 200 and postureStatus for valid keypoints
    test('should return 200 and postureStatus for valid keypoints', async () => {
        const res = await request(app)
            .post('/posenet')
            .send({
                chairId: 'test-chair-456',
                keypoints: [
                    { part: 'nose', score: 0.9, position: { x: 0, y: 0 } },
                    { part: 'leftShoulder', score: 0.9, position: { x: 100, y: 200 } },
                    { part: 'rightShoulder', score: 0.9, position: { x: 200, y: 200 } },
                    { part: 'leftEar', score: 0.9, position: { x: 90, y: 100 } },
                    { part: 'rightEar', score: 0.9, position: { x: 210, y: 100 } }
                ]
            });
        expect(res.statusCode).toBe(200);
        expect(res.body.message).toBe('PoseNet data received successfully');
        expect(['good', 'poor', 'not_sitting']).toContain(res.body.postureStatus);
    });
});


//  Cleanup: close MongoDB connection after all tests
afterAll(async () => {
    await new Promise(resolve => setTimeout(resolve, 500));  // prevent Jest from hanging
    await require('mongoose').connection.close();
});

