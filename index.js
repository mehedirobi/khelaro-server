const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const dns = require("node:dns");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

dotenv.config();

// MongoDB SRV DNS fix
dns.setServers(["1.1.1.1", "8.8.8.8"]);

const app = express();
const port = process.env.PORT || 3000;

// =========================
// Middleware
// =========================

app.use(cors());
app.use(express.json());

// =========================
// MongoDB
// =========================

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.yvhjyyn.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// =========================
// Server
// =========================

async function run() {
  try {
    await client.connect();

    const db = client.db("khelaro");

    const usersCollection = db.collection("users");
    const turfsCollection = db.collection("turfs");
    const bookingsCollection = db.collection("bookings");

    console.log("MongoDB Connected Successfully");

    // =====================================================
    // USERS API
    // =====================================================

    // Create User
    app.post("/users", async (req, res) => {
      try {
        const user = req.body;

        if (!user.email) {
          return res.status(400).send({
            message: "Email is required",
          });
        }

        const existingUser = await usersCollection.findOne({
          email: user.email,
        });

        if (existingUser) {
          return res.status(200).send({
            message: "User already exists",
            user: existingUser,
          });
        }

        const newUser = {
          uid: user.uid || "",
          name: user.name || "",
          email: user.email,
          phone: user.phone || "",
          photoURL: user.photoURL || "",
          role: user.role || "user",
          createdAt: new Date(),
        };

        const result = await usersCollection.insertOne(newUser);

        res.status(201).send({
          success: true,
          message: "User created successfully",
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error("Create user error:", error);

        res.status(500).send({
          success: false,
          message: "Failed to create user",
        });
      }
    });

    // Get User by Email
    app.get("/users/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const user = await usersCollection.findOne({
          email,
        });

        if (!user) {
          return res.status(404).send({
            message: "User not found",
          });
        }

        res.send(user);
      } catch (error) {
        console.error("Get user error:", error);

        res.status(500).send({
          message: "Failed to get user",
        });
      }
    });

    // Update User Role
    app.patch("/users/:email/role", async (req, res) => {
      try {
        const email = req.params.email;
        const { role } = req.body;

        const allowedRoles = ["user", "owner", "admin"];

        if (!allowedRoles.includes(role)) {
          return res.status(400).send({
            message: "Invalid role",
          });
        }

        const result = await usersCollection.updateOne(
          { email },
          {
            $set: {
              role,
              updatedAt: new Date(),
            },
          }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({
            message: "User not found",
          });
        }

        res.send({
          success: true,
          message: `User role updated to ${role}`,
        });
      } catch (error) {
        console.error("Update role error:", error);

        res.status(500).send({
          message: "Failed to update user role",
        });
      }
    });

    // =====================================================
    // TURF API
    // =====================================================

    // Create Turf
    app.post("/turfs", async (req, res) => {
      try {
        const turfData = req.body;

        if (
          !turfData.name ||
          !turfData.location ||
          !turfData.price ||
          !turfData.ownerEmail
        ) {
          return res.status(400).send({
            success: false,
            message: "Required turf information is missing",
          });
        }

        const newTurf = {
          name: turfData.name,
          location: turfData.location,
          description: turfData.description || "",
          price: Number(turfData.price),

          image: turfData.image || "",
          size: turfData.size || "",
          surface: turfData.surface || "",
          facilities: turfData.facilities || [],

          ownerEmail: turfData.ownerEmail,
          ownerId: turfData.ownerId || "",

          // New turf needs admin approval
          status: "pending",

          createdAt: new Date(),
        };

        const result = await turfsCollection.insertOne(newTurf);

        res.status(201).send({
          success: true,
          message: "Turf submitted successfully. Waiting for admin approval.",
          turfId: result.insertedId,
        });
      } catch (error) {
        console.error("Create turf error:", error);

        res.status(500).send({
          success: false,
          message: "Failed to create turf",
        });
      }
    });

    // Get Approved Turfs
    app.get("/turfs", async (req, res) => {
      try {
        const result = await turfsCollection
          .find({
            status: "approved",
          })
          .sort({
            createdAt: -1,
          })
          .toArray();

        res.send(result);
      } catch (error) {
        console.error("Get turfs error:", error);

        res.status(500).send({
          message: "Failed to get turfs",
        });
      }
    });

    // Get Single Turf
    app.get("/turfs/:id", async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({
            message: "Invalid turf ID",
          });
        }

        const turf = await turfsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!turf) {
          return res.status(404).send({
            message: "Turf not found",
          });
        }

        res.send(turf);
      } catch (error) {
        console.error("Get turf error:", error);

        res.status(500).send({
          message: "Failed to get turf",
        });
      }
    });

    // Get Owner's Turfs
    app.get("/owner/turfs/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const result = await turfsCollection
          .find({
            ownerEmail: email,
          })
          .sort({
            createdAt: -1,
          })
          .toArray();

        res.send(result);
      } catch (error) {
        console.error("Get owner turfs error:", error);

        res.status(500).send({
          message: "Failed to get owner turfs",
        });
      }
    });

    // Update Turf
    app.patch("/turfs/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const updatedData = req.body;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({
            message: "Invalid turf ID",
          });
        }

        delete updatedData._id;

        const result = await turfsCollection.updateOne(
          {
            _id: new ObjectId(id),
          },
          {
            $set: {
              ...updatedData,
              updatedAt: new Date(),
            },
          }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({
            message: "Turf not found",
          });
        }

        res.send({
          success: true,
          message: "Turf updated successfully",
          result,
        });
      } catch (error) {
        console.error("Update turf error:", error);

        res.status(500).send({
          message: "Failed to update turf",
        });
      }
    });

    // Delete Turf
    app.delete("/turfs/:id", async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({
            message: "Invalid turf ID",
          });
        }

        const result = await turfsCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).send({
            message: "Turf not found",
          });
        }

        res.send({
          success: true,
          message: "Turf deleted successfully",
        });
      } catch (error) {
        console.error("Delete turf error:", error);

        res.status(500).send({
          message: "Failed to delete turf",
        });
      }
    });

    // =====================================================
    // ADMIN TURF API
    // =====================================================

    // Get Pending Turfs
    app.get("/admin/turfs/pending", async (req, res) => {
      try {
        const result = await turfsCollection
          .find({
            status: "pending",
          })
          .sort({
            createdAt: -1,
          })
          .toArray();

        res.send(result);
      } catch (error) {
        console.error("Get pending turfs error:", error);

        res.status(500).send({
          message: "Failed to get pending turfs",
        });
      }
    });

    // Approve Turf
    app.patch("/admin/turfs/:id/approve", async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({
            message: "Invalid turf ID",
          });
        }

        const result = await turfsCollection.updateOne(
          {
            _id: new ObjectId(id),
          },
          {
            $set: {
              status: "approved",
              approvedAt: new Date(),
            },
          }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({
            message: "Turf not found",
          });
        }

        res.send({
          success: true,
          message: "Turf approved successfully",
        });
      } catch (error) {
        console.error("Approve turf error:", error);

        res.status(500).send({
          message: "Failed to approve turf",
        });
      }
    });

    // Reject Turf
    app.patch("/admin/turfs/:id/reject", async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({
            message: "Invalid turf ID",
          });
        }

        const result = await turfsCollection.updateOne(
          {
            _id: new ObjectId(id),
          },
          {
            $set: {
              status: "rejected",
              rejectedAt: new Date(),
            },
          }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({
            message: "Turf not found",
          });
        }

        res.send({
          success: true,
          message: "Turf rejected successfully",
        });
      } catch (error) {
        console.error("Reject turf error:", error);

        res.status(500).send({
          message: "Failed to reject turf",
        });
      }
    });

    // =====================================================
    // BOOKING API
    // =====================================================

    // Check Availability
    app.get("/bookings/availability", async (req, res) => {
      try {
        const { turfId, date } = req.query;

        if (!turfId || !date) {
          return res.status(400).send({
            message: "Turf ID and date are required",
          });
        }

        const bookings = await bookingsCollection
          .find({
            turfId,
            date,
            status: {
              $in: ["pending", "confirmed"],
            },
          })
          .sort({
            startTime: 1,
          })
          .toArray();

        res.send(bookings);
      } catch (error) {
        console.error("Availability error:", error);

        res.status(500).send({
          message: "Failed to get availability",
        });
      }
    });

    // Create Booking
    app.post("/bookings", async (req, res) => {
      try {
        const booking = req.body;

        const {
          turfId,
          turfName,
          userEmail,
          userName,
          date,
          startTime,
          endTime,
          price,
        } = booking;

        if (
          !turfId ||
          !userEmail ||
          !date ||
          !startTime ||
          !endTime
        ) {
          return res.status(400).send({
            message:
              "Turf ID, user email, date, start time and end time are required",
          });
        }

        // Check overlapping booking
        const existingBooking = await bookingsCollection.findOne({
          turfId,
          date,
          status: {
            $in: ["pending", "confirmed"],
          },

          $or: [
            {
              startTime: {
                $lt: endTime,
              },
              endTime: {
                $gt: startTime,
              },
            },
          ],
        });

        if (existingBooking) {
          return res.status(409).send({
            message: "This time slot is already booked",
          });
        }

        const newBooking = {
          turfId,
          turfName: turfName || "",
          userEmail,
          userName: userName || "",

          date,
          startTime,
          endTime,

          price: Number(price) || 0,

          status: "pending",
          paymentStatus: "unpaid",

          createdAt: new Date(),
        };

        const result = await bookingsCollection.insertOne(newBooking);

        res.status(201).send({
          success: true,
          message: "Booking created successfully",
          bookingId: result.insertedId,
        });
      } catch (error) {
        console.error("Create booking error:", error);

        res.status(500).send({
          message: "Failed to create booking",
        });
      }
    });

    // Get User Bookings
    app.get("/bookings/user/:email", async (req, res) => {
      try {
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
      } catch (error) {
        console.error("Get user bookings error:", error);

        res.status(500).send({
          message: "Failed to get bookings",
        });
      }
    });

    // Get Bookings by Turf
    app.get("/bookings/turf/:turfId", async (req, res) => {
      try {
        const turfId = req.params.turfId;

        const result = await bookingsCollection
          .find({
            turfId,
          })
          .sort({
            createdAt: -1,
          })
          .toArray();

        res.send(result);
      } catch (error) {
        console.error("Get turf bookings error:", error);

        res.status(500).send({
          message: "Failed to get turf bookings",
        });
      }
    });

    // Cancel Booking
    app.patch("/bookings/:id/cancel", async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({
            message: "Invalid booking ID",
          });
        }

        const result = await bookingsCollection.updateOne(
          {
            _id: new ObjectId(id),
          },
          {
            $set: {
              status: "cancelled",
              cancelledAt: new Date(),
            },
          }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({
            message: "Booking not found",
          });
        }

        res.send({
          success: true,
          message: "Booking cancelled successfully",
        });
      } catch (error) {
        console.error("Cancel booking error:", error);

        res.status(500).send({
          message: "Failed to cancel booking",
        });
      }
    });

    // Update Booking Status
    app.patch("/bookings/:id/status", async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({
            message: "Invalid booking ID",
          });
        }

        const allowedStatuses = [
          "pending",
          "confirmed",
          "cancelled",
        ];

        if (!allowedStatuses.includes(status)) {
          return res.status(400).send({
            message: "Invalid booking status",
          });
        }

        const result = await bookingsCollection.updateOne(
          {
            _id: new ObjectId(id),
          },
          {
            $set: {
              status,
              updatedAt: new Date(),
            },
          }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({
            message: "Booking not found",
          });
        }

        res.send({
          success: true,
          message: `Booking ${status} successfully`,
        });
      } catch (error) {
        console.error("Update booking status error:", error);

        res.status(500).send({
          message: "Failed to update booking status",
        });
      }
    });

    // =====================================================
    // MongoDB Ping
    // =====================================================

    await client.db("admin").command({
      ping: 1,
    });

    console.log(
      "Pinged your deployment. Successfully connected to MongoDB!"
    );
  } catch (error) {
    console.error("MongoDB Error:", error);
  }
}

run();

// =========================
// Home Route
// =========================

app.get("/", (req, res) => {
  res.send("Khelaro Server is Running");
});

// =========================
// Start Server
// =========================

app.listen(port, () => {
  console.log(`Khelaro server is running on port ${port}`);
});