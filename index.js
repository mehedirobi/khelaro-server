const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const dns = require("node:dns");
const {
  MongoClient,
  ServerApiVersion,
  ObjectId,
} = require("mongodb");

dotenv.config();

// =====================================================
// DNS
// =====================================================

dns.setServers(["1.1.1.1", "8.8.8.8"]);

// =====================================================
// APP CONFIG
// =====================================================

const app = express();
const port = process.env.PORT || 3000;

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json());


const normalizeEmail = (email = "") => {
  try {
    return decodeURIComponent(email)
      .trim()
      .toLowerCase();
  } catch {
    return String(email)
      .trim()
      .toLowerCase();
  }
};

const isValidObjectId = (id) => {
  return ObjectId.isValid(id);
};

// =====================================================
// MONGODB
// =====================================================

const uri = `mongodb+srv://${encodeURIComponent(
  process.env.DB_USER
)}:${encodeURIComponent(
  process.env.DB_PASS
)}@cluster0.yvhjyyn.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// =====================================================
// HOME
// =====================================================

app.get("/", (req, res) => {
  res.send("Khelaro Server is Running");
});

// =====================================================
// HEALTH
// =====================================================

app.get("/health", (req, res) => {
  res.send({
    success: true,
    message: "Khelaro API is healthy",
  });
});

// =====================================================
// DATABASE + ROUTES
// =====================================================

async function run() {
  try {
    // =================================================
    // CONNECT MONGODB
    // =================================================

    await client.connect();

    const db = client.db("khelaro");

    const usersCollection = db.collection("users");
    const turfsCollection = db.collection("turfs");
    const bookingsCollection = db.collection("bookings");
    const wishlistCollection = db.collection("wishlist");

    console.log("MongoDB Connected Successfully");

    // =================================================
    // USERS API
    // =================================================

    // -------------------------------------------------
    // Create User
    // -------------------------------------------------

    app.post("/users", async (req, res) => {
      try {
        const user = req.body;

        if (!user.email) {
          return res.status(400).send({
            success: false,
            message: "Email is required",
          });
        }

        const email = normalizeEmail(user.email);

        const existingUser =
          await usersCollection.findOne({
            email,
          });

        if (existingUser) {
          return res.status(200).send({
            success: true,
            message: "User already exists",
            user: existingUser,
          });
        }

        const newUser = {
          uid: user.uid || "",
          name: user.name || "",
          email,
          phone: user.phone || "",
          photoURL: user.photoURL || "",
          role: user.role || "user",
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result =
          await usersCollection.insertOne(newUser);

        const createdUser =
          await usersCollection.findOne({
            _id: result.insertedId,
          });

        res.status(201).send({
          success: true,
          message: "User created successfully",
          user: createdUser,
        });
      } catch (error) {
        console.error("Create user error:", error);

        res.status(500).send({
          success: false,
          message: "Failed to create user",
        });
      }
    });

    // -------------------------------------------------
    // Get All Users
    // -------------------------------------------------

    app.get("/users", async (req, res) => {
      try {
        const users = await usersCollection
          .find({})
          .sort({ createdAt: -1 })
          .toArray();

        res.send(users);
      } catch (error) {
        console.error("Get users error:", error);

        res.status(500).send({
          success: false,
          message: "Failed to get users",
        });
      }
    });

    // -------------------------------------------------
// Get User By Email
// -------------------------------------------------

app.get("/users/:email", async (req, res) => {
  try {
    // URL encoded email automatically decode করা
    const email = decodeURIComponent(req.params.email)
      .trim()
      .toLowerCase();

    console.log("Looking for user:", email);

    const user = await usersCollection.findOne({
      email: email,
    });

    console.log("Found user:", user);

    if (!user) {
      return res.status(404).send({
        success: false,
        message: "User not found",
        searchedEmail: email,
      });
    }

    res.status(200).send({
      success: true,
      user,
    });
  } catch (error) {
    console.error("Get user by email error:", error);

    res.status(500).send({
      success: false,
      message: "Failed to get user",
    });
  }
});

    // -------------------------------------------------
    // Update User Profile
    // -------------------------------------------------

    app.patch("/users/:email", async (req, res) => {
      try {
        const email = normalizeEmail(req.params.email);

        const {
          name,
          phone,
          photoURL,
        } = req.body;

        if (!name || !name.trim()) {
          return res.status(400).send({
            success: false,
            message: "Name is required",
          });
        }

        const updateData = {
          name: name.trim(),
          phone: phone || "",
          updatedAt: new Date(),
        };

        if (photoURL !== undefined) {
          updateData.photoURL = photoURL;
        }

        const result =
          await usersCollection.updateOne(
            { email },
            {
              $set: updateData,
            }
          );

        if (result.matchedCount === 0) {
          return res.status(404).send({
            success: false,
            message: "User not found",
          });
        }

        const updatedUser =
          await usersCollection.findOne({
            email,
          });

        res.send({
          success: true,
          message: "Profile updated successfully",
          user: updatedUser,
        });
      } catch (error) {
        console.error(
          "Update profile error:",
          error
        );

        res.status(500).send({
          success: false,
          message: "Failed to update profile",
        });
      }
    });

    // -------------------------------------------------
    // Update User Role
    // -------------------------------------------------

    app.patch(
      "/users/:email/role",
      async (req, res) => {
        try {
          const email = normalizeEmail(
            req.params.email
          );

          const { role } = req.body;

          const allowedRoles = [
            "user",
            "owner",
            "admin",
          ];

          if (!allowedRoles.includes(role)) {
            return res.status(400).send({
              success: false,
              message: "Invalid role",
            });
          }

          const result =
            await usersCollection.updateOne(
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
              success: false,
              message: "User not found",
            });
          }

          const updatedUser =
            await usersCollection.findOne({
              email,
            });

          res.send({
            success: true,
            message: `User role updated to ${role}`,
            user: updatedUser,
          });
        } catch (error) {
          console.error(
            "Update role error:",
            error
          );

          res.status(500).send({
            success: false,
            message: "Failed to update user role",
          });
        }
      }
    );

    // =================================================
    // TURF API
    // =================================================

    // -------------------------------------------------
    // Create Turf
    // -------------------------------------------------

    app.post("/turfs", async (req, res) => {
      try {
        const turfData = req.body;

        if (
          !turfData.name ||
          !turfData.location ||
          turfData.price === undefined ||
          turfData.price === null ||
          !turfData.ownerEmail
        ) {
          return res.status(400).send({
            success: false,
            message:
              "Required turf information is missing",
          });
        }

        const price = Number(turfData.price);

        if (Number.isNaN(price) || price < 0) {
          return res.status(400).send({
            success: false,
            message: "Invalid turf price",
          });
        }

        const newTurf = {
          name: turfData.name.trim(),
          location: turfData.location.trim(),
          description: turfData.description || "",
          price,
          image: turfData.image || "",
          size: turfData.size || "",
          surface: turfData.surface || "",

          facilities: Array.isArray(
            turfData.facilities
          )
            ? turfData.facilities
            : [],

          ownerEmail: normalizeEmail(
            turfData.ownerEmail
          ),

          ownerId: turfData.ownerId || "",

          status: "pending",

          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result =
          await turfsCollection.insertOne(
            newTurf
          );

        res.status(201).send({
          success: true,
          message:
            "Turf submitted successfully. Waiting for admin approval.",
          turfId: result.insertedId,
        });
      } catch (error) {
        console.error(
          "Create turf error:",
          error
        );

        res.status(500).send({
          success: false,
          message: "Failed to create turf",
        });
      }
    });

    // -------------------------------------------------
    // Get Approved Turfs
    // -------------------------------------------------

    app.get("/turfs", async (req, res) => {
      try {
        const result =
          await turfsCollection
            .find({
              status: "approved",
            })
            .sort({
              createdAt: -1,
            })
            .toArray();

        res.send(result);
      } catch (error) {
        console.error(
          "Get turfs error:",
          error
        );

        res.status(500).send({
          success: false,
          message: "Failed to get turfs",
        });
      }
    });

    // -------------------------------------------------
    // Get Single Turf
    // -------------------------------------------------

    app.get("/turfs/:id", async (req, res) => {
      try {
        const id = req.params.id;

        if (!isValidObjectId(id)) {
          return res.status(400).send({
            success: false,
            message: "Invalid turf ID",
          });
        }

        const turf =
          await turfsCollection.findOne({
            _id: new ObjectId(id),
          });

        if (!turf) {
          return res.status(404).send({
            success: false,
            message: "Turf not found",
          });
        }

        res.send(turf);
      } catch (error) {
        console.error(
          "Get turf error:",
          error
        );

        res.status(500).send({
          success: false,
          message: "Failed to get turf",
        });
      }
    });

    // -------------------------------------------------
    // Get Owner's Turfs
    // -------------------------------------------------

    app.get(
      "/owner/turfs/:email",
      async (req, res) => {
        try {
          const email = normalizeEmail(
            req.params.email
          );

          const result =
            await turfsCollection
              .find({
                ownerEmail: email,
              })
              .sort({
                createdAt: -1,
              })
              .toArray();

          res.send(result);
        } catch (error) {
          console.error(
            "Get owner turfs error:",
            error
          );

          res.status(500).send({
            success: false,
            message:
              "Failed to get owner turfs",
          });
        }
      }
    );

    // -------------------------------------------------
    // Update Turf
    // -------------------------------------------------

    app.patch("/turfs/:id", async (req, res) => {
      try {
        const id = req.params.id;

        if (!isValidObjectId(id)) {
          return res.status(400).send({
            success: false,
            message: "Invalid turf ID",
          });
        }

        const updatedData = {
          ...req.body,
          updatedAt: new Date(),
        };

        delete updatedData._id;
        delete updatedData.status;
        delete updatedData.ownerEmail;
        delete updatedData.ownerId;

        if (updatedData.name) {
          updatedData.name =
            updatedData.name.trim();
        }

        if (updatedData.location) {
          updatedData.location =
            updatedData.location.trim();
        }

        if (updatedData.price !== undefined) {
          const price = Number(
            updatedData.price
          );

          if (Number.isNaN(price) || price < 0) {
            return res.status(400).send({
              success: false,
              message: "Invalid turf price",
            });
          }

          updatedData.price = price;
        }

        const result =
          await turfsCollection.updateOne(
            {
              _id: new ObjectId(id),
            },
            {
              $set: updatedData,
            }
          );

        if (result.matchedCount === 0) {
          return res.status(404).send({
            success: false,
            message: "Turf not found",
          });
        }

        const updatedTurf =
          await turfsCollection.findOne({
            _id: new ObjectId(id),
          });

        res.send({
          success: true,
          message: "Turf updated successfully",
          turf: updatedTurf,
        });
      } catch (error) {
        console.error(
          "Update turf error:",
          error
        );

        res.status(500).send({
          success: false,
          message: "Failed to update turf",
        });
      }
    });

    // -------------------------------------------------
    // Delete Turf
    // -------------------------------------------------

    app.delete("/turfs/:id", async (req, res) => {
      try {
        const id = req.params.id;

        if (!isValidObjectId(id)) {
          return res.status(400).send({
            success: false,
            message: "Invalid turf ID",
          });
        }

        const result =
          await turfsCollection.deleteOne({
            _id: new ObjectId(id),
          });

        if (result.deletedCount === 0) {
          return res.status(404).send({
            success: false,
            message: "Turf not found",
          });
        }

        await wishlistCollection.deleteMany({
          turfId: id,
        });

        res.send({
          success: true,
          message: "Turf deleted successfully",
        });
      } catch (error) {
        console.error(
          "Delete turf error:",
          error
        );

        res.status(500).send({
          success: false,
          message: "Failed to delete turf",
        });
      }
    });

    // =================================================
    // ADMIN USERS API
    // =================================================

    // -------------------------------------------------
    // Get All Users
    // -------------------------------------------------

    app.get("/admin/users", async (req, res) => {
      try {
        const users =
          await usersCollection
            .find({})
            .sort({
              createdAt: -1,
            })
            .toArray();

        res.send(users);
      } catch (error) {
        console.error(
          "Get admin users error:",
          error
        );

        res.status(500).send({
          success: false,
          message: "Failed to get users",
        });
      }
    });

    // -------------------------------------------------
    // Customers
    // -------------------------------------------------

    app.get(
      "/admin/customers",
      async (req, res) => {
        try {
          const customers =
            await usersCollection
              .find({
                role: "user",
              })
              .sort({
                createdAt: -1,
              })
              .toArray();

          res.send(customers);
        } catch (error) {
          console.error(
            "Get customers error:",
            error
          );

          res.status(500).send({
            success: false,
            message:
              "Failed to get customers",
          });
        }
      }
    );

    // -------------------------------------------------
    // Owners
    // -------------------------------------------------

    app.get("/admin/owners", async (req, res) => {
      try {
        const owners =
          await usersCollection
            .find({
              role: "owner",
            })
            .sort({
              createdAt: -1,
            })
            .toArray();

        res.send(owners);
      } catch (error) {
        console.error(
          "Get owners error:",
          error
        );

        res.status(500).send({
          success: false,
          message: "Failed to get owners",
        });
      }
    });

    // -------------------------------------------------
    // Admins
    // -------------------------------------------------

    app.get("/admin/admins", async (req, res) => {
      try {
        const admins =
          await usersCollection
            .find({
              role: "admin",
            })
            .sort({
              createdAt: -1,
            })
            .toArray();

        res.send(admins);
      } catch (error) {
        console.error(
          "Get admins error:",
          error
        );

        res.status(500).send({
          success: false,
          message: "Failed to get admins",
        });
      }
    });

    // -------------------------------------------------
    // Delete User
    // -------------------------------------------------

    app.delete(
      "/admin/users/:email",
      async (req, res) => {
        try {
          const email = normalizeEmail(
            req.params.email
          );

          const user =
            await usersCollection.findOne({
              email,
            });

          if (!user) {
            return res.status(404).send({
              success: false,
              message: "User not found",
            });
          }

          if (user.role === "admin") {
            return res.status(403).send({
              success: false,
              message:
                "Admin account cannot be deleted",
            });
          }

          const result =
            await usersCollection.deleteOne({
              email,
            });

          if (result.deletedCount === 0) {
            return res.status(404).send({
              success: false,
              message: "User not found",
            });
          }

          res.send({
            success: true,
            message: "User deleted successfully",
          });
        } catch (error) {
          console.error(
            "Delete user error:",
            error
          );

          res.status(500).send({
            success: false,
            message:
              "Failed to delete user",
          });
        }
      }
    );

    // -------------------------------------------------
    // Admin Update User Role
    // -------------------------------------------------

    app.patch(
      "/admin/users/:email/role",
      async (req, res) => {
        try {
          const email = normalizeEmail(
            req.params.email
          );

          const { role } = req.body;

          const allowedRoles = [
            "user",
            "owner",
            "admin",
          ];

          if (!allowedRoles.includes(role)) {
            return res.status(400).send({
              success: false,
              message: "Invalid role",
            });
          }

          const result =
            await usersCollection.updateOne(
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
              success: false,
              message: "User not found",
            });
          }

          const updatedUser =
            await usersCollection.findOne({
              email,
            });

          res.send({
            success: true,
            message:
              `User role changed to ${role}`,
            user: updatedUser,
          });
        } catch (error) {
          console.error(
            "Admin role update error:",
            error
          );

          res.status(500).send({
            success: false,
            message:
              "Failed to update user role",
          });
        }
      }
    );

    // =================================================
    // ADMIN TURF API
    // =================================================

    // -------------------------------------------------
    // Get All Turfs
    // -------------------------------------------------

    app.get("/admin/turfs", async (req, res) => {
      try {
        const turfs =
          await turfsCollection
            .find({})
            .sort({
              createdAt: -1,
            })
            .toArray();

        res.send(turfs);
      } catch (error) {
        console.error(
          "Get admin turfs error:",
          error
        );

        res.status(500).send({
          success: false,
          message: "Failed to get turfs",
        });
      }
    });

    // -------------------------------------------------
    // Pending Turfs
    // -------------------------------------------------

    app.get(
      "/admin/turfs/pending",
      async (req, res) => {
        try {
          const turfs =
            await turfsCollection
              .find({
                status: "pending",
              })
              .sort({
                createdAt: -1,
              })
              .toArray();

          res.send(turfs);
        } catch (error) {
          console.error(
            "Get pending turfs error:",
            error
          );

          res.status(500).send({
            success: false,
            message:
              "Failed to get pending turfs",
          });
        }
      }
    );

    // -------------------------------------------------
    // Approve Turf
    // -------------------------------------------------

    app.patch(
      "/admin/turfs/:id/approve",
      async (req, res) => {
        try {
          const id = req.params.id;

          if (!isValidObjectId(id)) {
            return res.status(400).send({
              success: false,
              message: "Invalid turf ID",
            });
          }

          const result =
            await turfsCollection.updateOne(
              {
                _id: new ObjectId(id),
              },
              {
                $set: {
                  status: "approved",
                  approvedAt: new Date(),
                  updatedAt: new Date(),
                },
              }
            );

          if (result.matchedCount === 0) {
            return res.status(404).send({
              success: false,
              message: "Turf not found",
            });
          }

          res.send({
            success: true,
            message:
              "Turf approved successfully",
          });
        } catch (error) {
          console.error(
            "Approve turf error:",
            error
          );

          res.status(500).send({
            success: false,
            message:
              "Failed to approve turf",
          });
        }
      }
    );

    // -------------------------------------------------
    // Reject Turf
    // -------------------------------------------------

    app.patch(
      "/admin/turfs/:id/reject",
      async (req, res) => {
        try {
          const id = req.params.id;

          if (!isValidObjectId(id)) {
            return res.status(400).send({
              success: false,
              message: "Invalid turf ID",
            });
          }

          const result =
            await turfsCollection.updateOne(
              {
                _id: new ObjectId(id),
              },
              {
                $set: {
                  status: "rejected",
                  rejectedAt: new Date(),
                  updatedAt: new Date(),
                },
              }
            );

          if (result.matchedCount === 0) {
            return res.status(404).send({
              success: false,
              message: "Turf not found",
            });
          }

          res.send({
            success: true,
            message:
              "Turf rejected successfully",
          });
        } catch (error) {
          console.error(
            "Reject turf error:",
            error
          );

          res.status(500).send({
            success: false,
            message:
              "Failed to reject turf",
          });
        }
      }
    );

    // -------------------------------------------------
    // Delete Admin Turf
    // -------------------------------------------------

    app.delete(
      "/admin/turfs/:id",
      async (req, res) => {
        try {
          const id = req.params.id;

          if (!isValidObjectId(id)) {
            return res.status(400).send({
              success: false,
              message: "Invalid turf ID",
            });
          }

          const result =
            await turfsCollection.deleteOne({
              _id: new ObjectId(id),
            });

          if (result.deletedCount === 0) {
            return res.status(404).send({
              success: false,
              message: "Turf not found",
            });
          }

          await wishlistCollection.deleteMany({
            turfId: id,
          });

          res.send({
            success: true,
            message:
              "Turf deleted successfully",
          });
        } catch (error) {
          console.error(
            "Admin delete turf error:",
            error
          );

          res.status(500).send({
            success: false,
            message:
              "Failed to delete turf",
          });
        }
      }
    );

    // =================================================
    // BOOKING API
    // =================================================

    // -------------------------------------------------
    // Check Availability
    // -------------------------------------------------

    app.get(
      "/bookings/availability",
      async (req, res) => {
        try {
          const { turfId, date } = req.query;

          if (!turfId || !date) {
            return res.status(400).send({
              success: false,
              message:
                "Turf ID and date are required",
            });
          }

          const bookings =
            await bookingsCollection
              .find({
                turfId,
                date,
                status: {
                  $in: [
                    "pending",
                    "confirmed",
                  ],
                },
              })
              .sort({
                startTime: 1,
              })
              .toArray();

          res.send(bookings);
        } catch (error) {
          console.error(
            "Availability error:",
            error
          );

          res.status(500).send({
            success: false,
            message:
              "Failed to get availability",
          });
        }
      }
    );

    // -------------------------------------------------
    // Create Booking
    // -------------------------------------------------

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
            success: false,
            message:
              "Turf ID, user email, date, start time and end time are required",
          });
        }

        // Verify Turf

        let turf = null;

        if (isValidObjectId(turfId)) {
          turf =
            await turfsCollection.findOne({
              _id: new ObjectId(turfId),
              status: "approved",
            });
        }

        if (!turf) {
          return res.status(404).send({
            success: false,
            message:
              "Approved turf not found",
          });
        }

        // Check overlap

        const existingBooking =
          await bookingsCollection.findOne({
            turfId,
            date,

            status: {
              $in: [
                "pending",
                "confirmed",
              ],
            },

            startTime: {
              $lt: endTime,
            },

            endTime: {
              $gt: startTime,
            },
          });

        if (existingBooking) {
          return res.status(409).send({
            success: false,
            message:
              "This time slot is already booked",
          });
        }

        const finalPrice =
          price !== undefined &&
          price !== null
            ? Number(price)
            : Number(turf.price);

        const newBooking = {
          turfId,

          turfName:
            turfName || turf.name,

          userEmail:
            normalizeEmail(userEmail),

          userName: userName || "",

          ownerEmail:
            normalizeEmail(
              turf.ownerEmail || ""
            ),

          date,

          startTime,

          endTime,

          price:
            Number.isNaN(finalPrice)
              ? 0
              : finalPrice,

          status: "pending",

          paymentStatus: "unpaid",

          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result =
          await bookingsCollection.insertOne(
            newBooking
          );

        res.status(201).send({
          success: true,
          message:
            "Booking created successfully",
          bookingId: result.insertedId,
        });
      } catch (error) {
        console.error(
          "Create booking error:",
          error
        );

        res.status(500).send({
          success: false,
          message:
            "Failed to create booking",
        });
      }
    });

    // -------------------------------------------------
    // Get User Bookings
    // -------------------------------------------------

    app.get(
      "/bookings/user/:email",
      async (req, res) => {
        try {
          const email = normalizeEmail(
            req.params.email
          );

          const result =
            await bookingsCollection
              .find({
                userEmail: email,
              })
              .sort({
                createdAt: -1,
              })
              .toArray();

          res.send(result);
        } catch (error) {
          console.error(
            "Get user bookings error:",
            error
          );

          res.status(500).send({
            success: false,
            message:
              "Failed to get bookings",
          });
        }
      }
    );

    // -------------------------------------------------
    // Get Bookings By Turf
    // -------------------------------------------------

    app.get(
      "/bookings/turf/:turfId",
      async (req, res) => {
        try {
          const turfId =
            req.params.turfId;

          const result =
            await bookingsCollection
              .find({
                turfId,
              })
              .sort({
                createdAt: -1,
              })
              .toArray();

          res.send(result);
        } catch (error) {
          console.error(
            "Get turf bookings error:",
            error
          );

          res.status(500).send({
            success: false,
            message:
              "Failed to get turf bookings",
          });
        }
      }
    );

    // =================================================
    // OWNER BOOKING API
    // =================================================

    // -------------------------------------------------
    // Get Owner Bookings
    // -------------------------------------------------

    app.get(
      "/owner/bookings/:email",
      async (req, res) => {
        try {
          const email = normalizeEmail(
            req.params.email
          );

          const result =
            await bookingsCollection
              .find({
                ownerEmail: email,
              })
              .sort({
                createdAt: -1,
              })
              .toArray();

          res.send(result);
        } catch (error) {
          console.error(
            "Get owner bookings error:",
            error
          );

          res.status(500).send({
            success: false,
            message:
              "Failed to get owner bookings",
          });
        }
      }
    );

    // -------------------------------------------------
    // Owner Revenue
    // -------------------------------------------------

    app.get(
      "/owner/revenue/:email",
      async (req, res) => {
        try {
          const email = normalizeEmail(
            req.params.email
          );

          const result =
            await bookingsCollection
              .aggregate([
                {
                  $match: {
                    ownerEmail: email,
                    status: "confirmed",
                    paymentStatus: "paid",
                  },
                },

                {
                  $group: {
                    _id: "$turfId",

                    turfName: {
                      $first: "$turfName",
                    },

                    totalBookings: {
                      $sum: 1,
                    },

                    totalRevenue: {
                      $sum: "$price",
                    },
                  },
                },

                {
                  $sort: {
                    totalRevenue: -1,
                  },
                },
              ])
              .toArray();

          res.send(result);
        } catch (error) {
          console.error(
            "Owner revenue error:",
            error
          );

          res.status(500).send({
            success: false,
            message:
              "Failed to get owner revenue",
          });
        }
      }
    );

    // =================================================
    // BOOKING STATUS
    // =================================================

    // -------------------------------------------------
    // Cancel Booking
    // -------------------------------------------------

    app.patch(
      "/bookings/:id/cancel",
      async (req, res) => {
        try {
          const id = req.params.id;

          if (!isValidObjectId(id)) {
            return res.status(400).send({
              success: false,
              message:
                "Invalid booking ID",
            });
          }

          const result =
            await bookingsCollection.updateOne(
              {
                _id: new ObjectId(id),

                status: {
                  $in: [
                    "pending",
                    "confirmed",
                  ],
                },
              },
              {
                $set: {
                  status: "cancelled",
                  cancelledAt: new Date(),
                  updatedAt: new Date(),
                },
              }
            );

          if (result.matchedCount === 0) {
            return res.status(404).send({
              success: false,
              message:
                "Booking not found or already cancelled",
            });
          }

          res.send({
            success: true,
            message:
              "Booking cancelled successfully",
          });
        } catch (error) {
          console.error(
            "Cancel booking error:",
            error
          );

          res.status(500).send({
            success: false,
            message:
              "Failed to cancel booking",
          });
        }
      }
    );

    // -------------------------------------------------
    // Update Booking Status
    // -------------------------------------------------

    app.patch(
      "/bookings/:id/status",
      async (req, res) => {
        try {
          const id = req.params.id;
          const { status } = req.body;

          if (!isValidObjectId(id)) {
            return res.status(400).send({
              success: false,
              message:
                "Invalid booking ID",
            });
          }

          const allowedStatuses = [
            "pending",
            "confirmed",
            "cancelled",
          ];

          if (
            !allowedStatuses.includes(status)
          ) {
            return res.status(400).send({
              success: false,
              message:
                "Invalid booking status",
            });
          }

          const updateData = {
            status,
            updatedAt: new Date(),
          };

          if (status === "confirmed") {
            updateData.confirmedAt =
              new Date();
          }

          if (status === "cancelled") {
            updateData.cancelledAt =
              new Date();
          }

          const result =
            await bookingsCollection.updateOne(
              {
                _id: new ObjectId(id),
              },
              {
                $set: updateData,
              }
            );

          if (result.matchedCount === 0) {
            return res.status(404).send({
              success: false,
              message:
                "Booking not found",
            });
          }

          res.send({
            success: true,
            message:
              `Booking ${status} successfully`,
          });
        } catch (error) {
          console.error(
            "Update booking status error:",
            error
          );

          res.status(500).send({
            success: false,
            message:
              "Failed to update booking status",
          });
        }
      }
    );

    // -------------------------------------------------
    // Update Payment Status
    // -------------------------------------------------

    app.patch(
      "/bookings/:id/payment",
      async (req, res) => {
        try {
          const id = req.params.id;
          const { paymentStatus } = req.body;

          if (!isValidObjectId(id)) {
            return res.status(400).send({
              success: false,
              message:
                "Invalid booking ID",
            });
          }

          const allowedPaymentStatuses = [
            "unpaid",
            "paid",
            "refunded",
          ];

          if (
            !allowedPaymentStatuses.includes(
              paymentStatus
            )
          ) {
            return res.status(400).send({
              success: false,
              message:
                "Invalid payment status",
            });
          }

          const updateData = {
            paymentStatus,
            updatedAt: new Date(),
          };

          if (paymentStatus === "paid") {
            updateData.paidAt = new Date();
          }

          if (
            paymentStatus === "refunded"
          ) {
            updateData.refundedAt =
              new Date();
          }

          const result =
            await bookingsCollection.updateOne(
              {
                _id: new ObjectId(id),
              },
              {
                $set: updateData,
              }
            );

          if (result.matchedCount === 0) {
            return res.status(404).send({
              success: false,
              message:
                "Booking not found",
            });
          }

          res.send({
            success: true,
            message:
              "Payment status updated successfully",
          });
        } catch (error) {
          console.error(
            "Payment status error:",
            error
          );

          res.status(500).send({
            success: false,
            message:
              "Failed to update payment status",
          });
        }
      }
    );

    // =================================================
    // ADMIN BOOKING API
    // =================================================

    // -------------------------------------------------
    // Get All Bookings
    // -------------------------------------------------

    app.get(
      "/admin/bookings",
      async (req, res) => {
        try {
          const bookings =
            await bookingsCollection
              .find({})
              .sort({
                createdAt: -1,
              })
              .toArray();

          res.send(bookings);
        } catch (error) {
          console.error(
            "Get admin bookings error:",
            error
          );

          res.status(500).send({
            success: false,
            message:
              "Failed to get bookings",
          });
        }
      }
    );

    // =================================================
    // ADMIN DASHBOARD
    // =================================================

    // -------------------------------------------------
    // Dashboard Statistics
    // -------------------------------------------------

    app.get(
      "/admin/stats",
      async (req, res) => {
        try {
          const [
            totalUsers,
            totalOwners,
            totalAdmins,
            totalTurfs,
            approvedTurfs,
            pendingTurfs,
            rejectedTurfs,
            totalBookings,
            pendingBookings,
            confirmedBookings,
            cancelledBookings,
          ] = await Promise.all([
            usersCollection.countDocuments({
              role: "user",
            }),

            usersCollection.countDocuments({
              role: "owner",
            }),

            usersCollection.countDocuments({
              role: "admin",
            }),

            turfsCollection.countDocuments({}),

            turfsCollection.countDocuments({
              status: "approved",
            }),

            turfsCollection.countDocuments({
              status: "pending",
            }),

            turfsCollection.countDocuments({
              status: "rejected",
            }),

            bookingsCollection.countDocuments({}),

            bookingsCollection.countDocuments({
              status: "pending",
            }),

            bookingsCollection.countDocuments({
              status: "confirmed",
            }),

            bookingsCollection.countDocuments({
              status: "cancelled",
            }),
          ]);

          const revenueResult =
            await bookingsCollection
              .aggregate([
                {
                  $match: {
                    status: "confirmed",
                    paymentStatus: "paid",
                  },
                },

                {
                  $group: {
                    _id: null,

                    totalRevenue: {
                      $sum: "$price",
                    },
                  },
                },
              ])
              .toArray();

          const totalRevenue =
            revenueResult[0]?.totalRevenue || 0;

          res.send({
            success: true,

            stats: {
              totalUsers,
              totalOwners,
              totalAdmins,
              totalTurfs,
              approvedTurfs,
              pendingTurfs,
              rejectedTurfs,
              totalBookings,
              pendingBookings,
              confirmedBookings,
              cancelledBookings,
              totalRevenue,
            },
          });
        } catch (error) {
          console.error(
            "Admin stats error:",
            error
          );

          res.status(500).send({
            success: false,
            message:
              "Failed to get admin statistics",
          });
        }
      }
    );

    // =================================================
    // ADMIN REVENUE
    // =================================================

    app.get(
      "/admin/revenue",
      async (req, res) => {
        try {
          const result =
            await bookingsCollection
              .aggregate([
                {
                  $match: {
                    status: "confirmed",
                    paymentStatus: "paid",
                  },
                },

                {
                  $group: {
                    _id: "$turfId",

                    turfName: {
                      $first: "$turfName",
                    },

                    ownerEmail: {
                      $first: "$ownerEmail",
                    },

                    totalBookings: {
                      $sum: 1,
                    },

                    totalRevenue: {
                      $sum: "$price",
                    },
                  },
                },

                {
                  $sort: {
                    totalRevenue: -1,
                  },
                },
              ])
              .toArray();

          res.send(result);
        } catch (error) {
          console.error(
            "Admin revenue error:",
            error
          );

          res.status(500).send({
            success: false,
            message:
              "Failed to get revenue",
          });
        }
      }
    );

    // =================================================
    // WISHLIST API
    // =================================================

    // -------------------------------------------------
    // Get Wishlist
    // -------------------------------------------------

    app.get(
      "/wishlist/:email",
      async (req, res) => {
        try {
          const email = normalizeEmail(
            req.params.email
          );

          const wishlist =
            await wishlistCollection
              .find({
                userEmail: email,
              })
              .sort({
                createdAt: -1,
              })
              .toArray();

          res.send(wishlist);
        } catch (error) {
          console.error(
            "Get wishlist error:",
            error
          );

          res.status(500).send({
            success: false,
            message:
              "Failed to get wishlist",
          });
        }
      }
    );

    // -------------------------------------------------
    // Add Wishlist
    // -------------------------------------------------

    app.post(
      "/wishlist",
      async (req, res) => {
        try {
          const {
            userEmail,
            turfId,
            turfName,
            turfImage,
            turfLocation,
            price,
          } = req.body;

          if (!userEmail || !turfId) {
            return res.status(400).send({
              success: false,
              message:
                "User email and turf ID are required",
            });
          }

          const email =
            normalizeEmail(userEmail);

          const existing =
            await wishlistCollection.findOne({
              userEmail: email,
              turfId,
            });

          if (existing) {
            return res.status(200).send({
              success: true,
              message:
                "Turf already in wishlist",
              item: existing,
            });
          }

          const wishlistItem = {
            userEmail: email,

            turfId,

            turfName: turfName || "",

            turfImage: turfImage || "",

            turfLocation:
              turfLocation || "",

            price: Number(price) || 0,

            createdAt: new Date(),
          };

          const result =
            await wishlistCollection.insertOne(
              wishlistItem
            );

          res.status(201).send({
            success: true,
            message: "Added to wishlist",
            wishlistId:
              result.insertedId,
          });
        } catch (error) {
          console.error(
            "Add wishlist error:",
            error
          );

          res.status(500).send({
            success: false,
            message:
              "Failed to add wishlist",
          });
        }
      }
    );

    // -------------------------------------------------
    // Remove Wishlist
    // -------------------------------------------------

    app.delete(
      "/wishlist/:email/:turfId",
      async (req, res) => {
        try {
          const email = normalizeEmail(
            req.params.email
          );

          const turfId =
            req.params.turfId;

          const result =
            await wishlistCollection.deleteOne(
              {
                userEmail: email,
                turfId,
              }
            );

          if (result.deletedCount === 0) {
            return res.status(404).send({
              success: false,
              message:
                "Wishlist item not found",
            });
          }

          res.send({
            success: true,
            message:
              "Removed from wishlist",
          });
        } catch (error) {
          console.error(
            "Remove wishlist error:",
            error
          );

          res.status(500).send({
            success: false,
            message:
              "Failed to remove wishlist",
          });
        }
      }
    );

    // =================================================
    // MONGODB PING
    // =================================================

    await db.command({
      ping: 1,
    });

    console.log(
      "Pinged your deployment. Successfully connected to MongoDB!"
    );

    // =================================================
    // 404 ROUTE
    // =================================================

    app.use((req, res) => {
      res.status(404).send({
        success: false,
        message: "API route not found",
        path: req.originalUrl,
      });
    });

    // =================================================
    // GLOBAL ERROR HANDLER
    // =================================================

    app.use(
      (error, req, res, next) => {
        console.error(
          "Global error:",
          error
        );

        res.status(500).send({
          success: false,
          message:
            "Internal server error",
        });
      }
    );

    // =================================================
    // START SERVER
    // =================================================

    app.listen(port, () => {
      console.log(
        `Khelaro server is running on port ${port}`
      );
    });
  } catch (error) {
    console.error(
      "MongoDB Connection Error:",
      error
    );

    process.exit(1);
  }
}

// =====================================================
// START APPLICATION
// =====================================================

run();