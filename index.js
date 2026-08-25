const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion } = require("mongodb");

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());


// MongoDB URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// MongoDB Client
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect to MongoDB
    await client.connect();

    // Database
    const db = client.db("khelaroDB");

    // Collections
    const usersCollection = db.collection("users");
    const turfsCollection = db.collection("turfs");
    const bookingsCollection = db.collection("bookings");

    console.log("MongoDB Connected Successfully");

    // =========================
    // USERS API
    // =========================

    // Create user
    app.post("/users", async (req, res) => {
      const user = req.body;

      // Check if user already exists
      const existingUser = await usersCollection.findOne({
        email: user.email,
      });

      if (existingUser) {
        return res.send({
          message: "User already exists",
          insertedId: null,
        });
      }

      const result = await usersCollection.insertOne({
        ...user,
        role: user.role || "user",
        createdAt: new Date(),
      });

      res.send(result);
    });

    // Get user by email
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;

      const user = await usersCollection.findOne({ email });

      if (!user) {
        return res.status(404).send({
          message: "User not found",
        });
      }

      res.send(user);
    });

    // =========================
    // TURFS API
    // =========================

    // Get all approved turfs
    app.get("/turfs", async (req, res) => {
      const result = await turfsCollection
        .find({ status: "approved" })
        .toArray();

      res.send(result);
    });

    // Get single turf
    app.get("/turfs/:id", async (req, res) => {
      const { ObjectId } = require("mongodb");

      const id = req.params.id;

      const turf = await turfsCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!turf) {
        return res.status(404).send({
          message: "Turf not found",
        });
      }

      res.send(turf);
    });

    // Create turf
    app.post("/turfs", async (req, res) => {
      const turf = req.body;

      const result = await turfsCollection.insertOne({
        ...turf,
        status: "pending",
        createdAt: new Date(),
      });

      res.send(result);
    });

    // =========================
    // BOOKINGS API
    // =========================

    // Create booking
    app.post("/bookings", async (req, res) => {
      const booking = req.body;

      const {
        turfId,
        date,
        startTime,
        endTime,
      } = booking;

      // Check for existing booking
      const existingBooking = await bookingsCollection.findOne({
        turfId,
        date,
        startTime,
        endTime,
        status: {
          $in: ["pending", "confirmed"],
        },
      });

      if (existingBooking) {
        return res.status(409).send({
          message: "This time slot is already booked",
        });
      }

      const result = await bookingsCollection.insertOne({
        ...booking,
        status: "pending",
        paymentStatus: "unpaid",
        createdAt: new Date(),
      });

      res.status(201).send(result);
    });

    // Get bookings by user email
    app.get("/bookings/user/:email", async (req, res) => {
      const email = req.params.email;

      const result = await bookingsCollection
        .find({
          userEmail: email,
        })
        .sort({
          createdAt: -1,
        })
        .toArray();

      res.send(result);
    });

    // MongoDB connection check
    await client.db("admin").command({ ping: 1 });

    console.log("Pinged your deployment. Successfully connected to MongoDB!");
  } finally {
    // Keep connection alive
  }
}

run().catch(console.dir);

// Home route
app.get("/", (req, res) => {
  res.send("Khelaro Server is Running");
});

// Start server
app.listen(port, () => {
  console.log(`Khelaro server is running on port ${port}`);
});