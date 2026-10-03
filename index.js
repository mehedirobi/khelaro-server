const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const dns = require("node:dns");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

dotenv.config();

dns.setServers(["1.1.1.1", "8.8.8.8"]);

const app = express();
const port = process.env.PORT || 3000;

// --------------------------------------------------
// Middleware
// --------------------------------------------------

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// --------------------------------------------------
// Cloudinary
// --------------------------------------------------

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// --------------------------------------------------
// Multer
// --------------------------------------------------

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: 5 * 1024 * 1024,
  },

  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Only JPG, PNG and WEBP images are allowed"
        )
      );
    }
  },
});

// --------------------------------------------------
// Helpers
// --------------------------------------------------

const normalizeEmail = (email = "") => {
  try {
    return decodeURIComponent(String(email))
      .trim()
      .toLowerCase();
  } catch {
    return String(email).trim().toLowerCase();
  }
};

const isValidObjectId = (id) => ObjectId.isValid(id);

// --------------------------------------------------
// MongoDB
// --------------------------------------------------

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

// --------------------------------------------------
// Basic Routes
// --------------------------------------------------

app.get("/", (req, res) => {
  res.send("Khelaro Server is Running");
});

app.get("/health", (req, res) => {
  res.send({
    success: true,
    message: "Khelaro API is healthy",
  });
});

// ==================================================
// DATABASE
// ==================================================

async function run() {
  try {
    await client.connect();

    const db = client.db("khelaro");

    const usersCollection = db.collection("users");
    const turfsCollection = db.collection("turfs");
    const bookingsCollection = db.collection("bookings");
    const wishlistCollection = db.collection("wishlist");

    console.log("MongoDB Connected Successfully");

    // ==================================================
    // USERS
    // ==================================================

    // --------------------------------------------------
    // Create User
    // --------------------------------------------------

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

        const existingUser = await usersCollection.findOne({
          email,
        });

        if (existingUser) {
          return res.send({
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
          location: user.location || "",
          photoURL: user.photoURL || "",
          role: user.role || "user",
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await usersCollection.insertOne(
          newUser
        );

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
        console.error("Create user:", error);

        res.status(500).send({
          success: false,
          message: "Failed to create user",
        });
      }
    });

    // --------------------------------------------------
    // Get All Users
    // --------------------------------------------------

    app.get("/users", async (req, res) => {
      try {
        const users = await usersCollection
          .find({})
          .sort({ createdAt: -1 })
          .toArray();

        res.send(users);
      } catch (error) {
        console.error("Get users:", error);

        res.status(500).send({
          success: false,
          message: "Failed to get users",
        });
      }
    });

    // --------------------------------------------------
    // Get User By Email
    // --------------------------------------------------

    app.get("/users/:email", async (req, res) => {
      try {
        const email = normalizeEmail(req.params.email);

        const user = await usersCollection.findOne({
          email,
        });

        if (!user) {
          return res.status(404).send({
            success: false,
            message: "User not found",
          });
        }

        res.send({
          success: true,
          user,
        });
      } catch (error) {
        console.error("Get user:", error);

        res.status(500).send({
          success: false,
          message: "Failed to get user",
        });
      }
    });

    // --------------------------------------------------
    // Update User Profile
    // --------------------------------------------------

    app.patch("/users/:email", async (req, res) => {
      try {
        const email = normalizeEmail(req.params.email);

        const {
          name,
          phone,
          location,
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
          phone: String(phone || "").trim(),
          location: String(location || "").trim(),
          updatedAt: new Date(),
        };

        if (photoURL !== undefined) {
          updateData.photoURL = photoURL;
        }

        const result = await usersCollection.updateOne(
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
        console.error("Update profile:", error);

        res.status(500).send({
          success: false,
          message: "Failed to update profile",
        });
      }
    });

    // --------------------------------------------------
    // Upload Profile Photo
    // --------------------------------------------------

    app.post(
      "/users/:email/photo",
      upload.single("photo"),
      async (req, res) => {
        try {
          const email = normalizeEmail(
            req.params.email
          );

          if (!email) {
            return res.status(400).send({
              success: false,
              message: "User email is required",
            });
          }

          if (!req.file) {
            return res.status(400).send({
              success: false,
              message: "Profile photo is required",
            });
          }

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

          // Upload image to Cloudinary
          const uploadToCloudinary = () => {
            return new Promise(
              (resolve, reject) => {
                const stream =
                  cloudinary.uploader.upload_stream(
                    {
                      folder:
                        "khelaro/profile-photos",

                      public_id: `user-${email.replace(
                        /[^a-zA-Z0-9]/g,
                        "_"
                      )}`,

                      overwrite: true,

                      resource_type: "image",
                    },
                    (error, result) => {
                      if (error) {
                        reject(error);
                      } else {
                        resolve(result);
                      }
                    }
                  );

                stream.end(req.file.buffer);
              }
            );
          };

          const result =
            await uploadToCloudinary();

          // Save Cloudinary URL in MongoDB
          await usersCollection.updateOne(
            { email },
            {
              $set: {
                photoURL: result.secure_url,
                updatedAt: new Date(),
              },
            }
          );

          const updatedUser =
            await usersCollection.findOne({
              email,
            });

          res.send({
            success: true,
            message:
              "Profile photo uploaded successfully",

            photoURL: result.secure_url,

            user: updatedUser,
          });
        } catch (error) {
          console.error(
            "Upload profile photo:",
            error
          );

          res.status(500).send({
            success: false,
            message:
              error.message ||
              "Failed to upload profile photo",
          });
        }
      }
    );

    // --------------------------------------------------
    // Update User Role
    // --------------------------------------------------

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

          if (!result.matchedCount) {
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
            "Update role:",
            error
          );

          res.status(500).send({
            success: false,
            message: "Failed to update user role",
          });
        }
      }
    );

    // ==================================================
    // TURFS
    // ==================================================

    // --------------------------------------------------
    // Create Turf
    // --------------------------------------------------

    app.post("/turfs", async (req, res) => {
      try {
        const data = req.body;

        if (
          !data.name ||
          !data.location ||
          data.price === undefined ||
          !data.ownerEmail
        ) {
          return res.status(400).send({
            success: false,
            message:
              "Required turf information is missing",
          });
        }

        const price = Number(data.price);

        if (Number.isNaN(price) || price < 0) {
          return res.status(400).send({
            success: false,
            message: "Invalid turf price",
          });
        }

        const newTurf = {
          name: data.name.trim(),
          location: data.location.trim(),
          description: data.description || "",
          price,
          image: data.image || "",
          size: data.size || "",
          surface: data.surface || "",

          facilities: Array.isArray(
            data.facilities
          )
            ? data.facilities
            : [],

          ownerEmail: normalizeEmail(
            data.ownerEmail
          ),

          ownerId: data.ownerId || "",

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
          message: "Turf submitted successfully",
          turfId: result.insertedId,
        });
      } catch (error) {
        console.error("Create turf:", error);

        res.status(500).send({
          success: false,
          message: "Failed to create turf",
        });
      }
    });

    // --------------------------------------------------
    // Get Approved Turfs
    // --------------------------------------------------

    app.get("/turfs", async (req, res) => {
      try {
        const turfs = await turfsCollection
          .find({ status: "approved" })
          .sort({ createdAt: -1 })
          .toArray();

        res.send(turfs);
      } catch (error) {
        console.error("Get turfs:", error);

        res.status(500).send({
          success: false,
          message: "Failed to get turfs",
        });
      }
    });

    // --------------------------------------------------
    // Get Turf By ID
    // --------------------------------------------------

    app.get("/turfs/:id", async (req, res) => {
      try {
        const { id } = req.params;

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
        console.error("Get turf:", error);

        res.status(500).send({
          success: false,
          message: "Failed to get turf",
        });
      }
    });

    // --------------------------------------------------
    // Owner Turfs
    // --------------------------------------------------

    app.get(
      "/owner/turfs/:email",
      async (req, res) => {
        try {
          const email = normalizeEmail(
            req.params.email
          );

          const turfs =
            await turfsCollection
              .find({
                ownerEmail: email,
              })
              .sort({ createdAt: -1 })
              .toArray();

          res.send(turfs);
        } catch (error) {
          console.error(
            "Get owner turfs:",
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

    // --------------------------------------------------
    // Update Turf
    // --------------------------------------------------

    app.patch("/turfs/:id", async (req, res) => {
      try {
        const { id } = req.params;

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

          if (
            Number.isNaN(price) ||
            price < 0
          ) {
            return res.status(400).send({
              success: false,
              message: "Invalid turf price",
            });
          }

          updatedData.price = price;
        }

        const result =
          await turfsCollection.updateOne(
            { _id: new ObjectId(id) },
            {
              $set: updatedData,
            }
          );

        if (!result.matchedCount) {
          return res.status(404).send({
            success: false,
            message: "Turf not found",
          });
        }

        const turf =
          await turfsCollection.findOne({
            _id: new ObjectId(id),
          });

        res.send({
          success: true,
          message: "Turf updated successfully",
          turf,
        });
      } catch (error) {
        console.error("Update turf:", error);

        res.status(500).send({
          success: false,
          message: "Failed to update turf",
        });
      }
    });

    // --------------------------------------------------
    // Delete Turf
    // --------------------------------------------------

    app.delete("/turfs/:id", async (req, res) => {
      try {
        const { id } = req.params;

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

        if (!result.deletedCount) {
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
        console.error("Delete turf:", error);

        res.status(500).send({
          success: false,
          message: "Failed to delete turf",
        });
      }
    });

    // ==================================================
    // ADMIN USERS
    // ==================================================

    app.get("/admin/users", async (req, res) => {
      try {
        const users =
          await usersCollection
            .find({})
            .sort({ createdAt: -1 })
            .toArray();

        res.send(users);
      } catch (error) {
        console.error(
          "Admin users:",
          error
        );

        res.status(500).send({
          success: false,
          message: "Failed to get users",
        });
      }
    });

    app.get(
      "/admin/customers",
      async (req, res) => {
        try {
          const users =
            await usersCollection
              .find({ role: "user" })
              .sort({ createdAt: -1 })
              .toArray();

          res.send(users);
        } catch (error) {
          console.error(
            "Admin customers:",
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

    app.get(
      "/admin/owners",
      async (req, res) => {
        try {
          const users =
            await usersCollection
              .find({ role: "owner" })
              .sort({ createdAt: -1 })
              .toArray();

          res.send(users);
        } catch (error) {
          console.error(
            "Admin owners:",
            error
          );

          res.status(500).send({
            success: false,
            message: "Failed to get owners",
          });
        }
      }
    );

    app.get(
      "/admin/admins",
      async (req, res) => {
        try {
          const users =
            await usersCollection
              .find({ role: "admin" })
              .sort({ createdAt: -1 })
              .toArray();

          res.send(users);
        } catch (error) {
          console.error(
            "Admin admins:",
            error
          );

          res.status(500).send({
            success: false,
            message: "Failed to get admins",
          });
        }
      }
    );

    // --------------------------------------------------
    // Delete User
    // --------------------------------------------------

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

          if (!result.deletedCount) {
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
            "Delete user:",
            error
          );

          res.status(500).send({
            success: false,
            message: "Failed to delete user",
          });
        }
      }
    );

    // --------------------------------------------------
    // Admin Role Update
    // --------------------------------------------------

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

          if (!result.matchedCount) {
            return res.status(404).send({
              success: false,
              message: "User not found",
            });
          }

          const user =
            await usersCollection.findOne({
              email,
            });

          res.send({
            success: true,
            message: `User role changed to ${role}`,
            user,
          });
        } catch (error) {
          console.error(
            "Admin role:",
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

    // ==================================================
    // ADMIN TURFS
    // ==================================================

    app.get("/admin/turfs", async (req, res) => {
      try {
        const turfs =
          await turfsCollection
            .find({})
            .sort({ createdAt: -1 })
            .toArray();

        res.send(turfs);
      } catch (error) {
        console.error(
          "Admin turfs:",
          error
        );

        res.status(500).send({
          success: false,
          message: "Failed to get turfs",
        });
      }
    });

    app.get(
      "/admin/turfs/pending",
      async (req, res) => {
        try {
          const turfs =
            await turfsCollection
              .find({ status: "pending" })
              .sort({ createdAt: -1 })
              .toArray();

          res.send(turfs);
        } catch (error) {
          console.error(
            "Pending turfs:",
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

    // --------------------------------------------------
    // Approve Turf
    // --------------------------------------------------

    app.patch(
      "/admin/turfs/:id/approve",
      async (req, res) => {
        try {
          const { id } = req.params;

          if (!isValidObjectId(id)) {
            return res.status(400).send({
              success: false,
              message: "Invalid turf ID",
            });
          }

          const result =
            await turfsCollection.updateOne(
              { _id: new ObjectId(id) },
              {
                $set: {
                  status: "approved",
                  approvedAt: new Date(),
                  updatedAt: new Date(),
                },
              }
            );

          if (!result.matchedCount) {
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
            "Approve turf:",
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

    // --------------------------------------------------
    // Reject Turf
    // --------------------------------------------------

    app.patch(
      "/admin/turfs/:id/reject",
      async (req, res) => {
        try {
          const { id } = req.params;

          if (!isValidObjectId(id)) {
            return res.status(400).send({
              success: false,
              message: "Invalid turf ID",
            });
          }

          const result =
            await turfsCollection.updateOne(
              { _id: new ObjectId(id) },
              {
                $set: {
                  status: "rejected",
                  rejectedAt: new Date(),
                  updatedAt: new Date(),
                },
              }
            );

          if (!result.matchedCount) {
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
            "Reject turf:",
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

    // --------------------------------------------------
    // Admin Delete Turf
    // --------------------------------------------------

    app.delete(
      "/admin/turfs/:id",
      async (req, res) => {
        try {
          const { id } = req.params;

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

          if (!result.deletedCount) {
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
            "Admin delete turf:",
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

    // ==================================================
    // WISHLIST
    // ==================================================

    // --------------------------------------------------
    // Get Wishlist
    // --------------------------------------------------

    app.get(
      "/wishlist/:email",
      async (req, res) => {
        try {
          const email = normalizeEmail(
            req.params.email
          );

          if (!email) {
            return res.status(400).send({
              success: false,
              message:
                "User email is required",
            });
          }

          const items =
            await wishlistCollection
              .find({
                userEmail: email,
              })
              .sort({ createdAt: -1 })
              .toArray();

          if (!items.length) {
            return res.send([]);
          }

          const turfIds = items
            .map((item) => item.turfId)
            .filter(isValidObjectId)
            .map(
              (id) => new ObjectId(id)
            );

          const turfs =
            await turfsCollection
              .find({
                _id: {
                  $in: turfIds,
                },
                status: "approved",
              })
              .toArray();

          const result = items
            .map((item) => {
              const turf = turfs.find(
                (t) =>
                  t._id.toString() ===
                  String(item.turfId)
              );

              if (!turf) return null;

              return {
                wishlistId: item._id,

                turfId: turf._id,

                name: turf.name,

                location:
                  turf.location,

                description:
                  turf.description || "",

                price: turf.price || 0,

                image: turf.image || "",

                size: turf.size || "",

                surface:
                  turf.surface || "",

                facilities:
                  turf.facilities || [],

                ownerEmail:
                  turf.ownerEmail || "",

                status: turf.status,

                createdAt:
                  item.createdAt,
              };
            })
            .filter(Boolean);

          res.send(result);
        } catch (error) {
          console.error(
            "Get wishlist:",
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

    // --------------------------------------------------
    // Add Wishlist
    // --------------------------------------------------

    app.post(
      "/wishlist",
      async (req, res) => {
        try {
          const {
            userEmail,
            turfId,
          } = req.body;

          if (!userEmail || !turfId) {
            return res.status(400).send({
              success: false,
              message:
                "User email and turf ID are required",
            });
          }

          if (!isValidObjectId(turfId)) {
            return res.status(400).send({
              success: false,
              message:
                "Invalid turf ID",
            });
          }

          const email =
            normalizeEmail(userEmail);

          const turf =
            await turfsCollection.findOne({
              _id: new ObjectId(turfId),
              status: "approved",
            });

          if (!turf) {
            return res.status(404).send({
              success: false,
              message:
                "Approved turf not found",
            });
          }

          const existing =
            await wishlistCollection.findOne(
              {
                userEmail: email,
                turfId: String(turfId),
              }
            );

          if (existing) {
            return res.send({
              success: true,
              message:
                "Turf is already in wishlist",
              wishlist: existing,
            });
          }

          const wishlist = {
            userEmail: email,
            turfId: String(turfId),
            createdAt: new Date(),
          };

          const result =
            await wishlistCollection.insertOne(
              wishlist
            );

          res.status(201).send({
            success: true,
            message:
              "Turf added to wishlist",

            wishlist: {
              ...wishlist,
              _id: result.insertedId,
            },
          });
        } catch (error) {
          console.error(
            "Add wishlist:",
            error
          );

          res.status(500).send({
            success: false,
            message:
              "Failed to add turf to wishlist",
          });
        }
      }
    );

    // --------------------------------------------------
    // Remove Wishlist
    // --------------------------------------------------

    app.delete(
      "/wishlist/:email/:turfId",
      async (req, res) => {
        try {
          const email = normalizeEmail(
            req.params.email
          );

          const { turfId } = req.params;

          if (!email || !turfId) {
            return res.status(400).send({
              success: false,
              message:
                "User email and turf ID are required",
            });
          }

          if (!isValidObjectId(turfId)) {
            return res.status(400).send({
              success: false,
              message:
                "Invalid turf ID",
            });
          }

          const result =
            await wishlistCollection.deleteOne(
              {
                userEmail: email,
                turfId: String(turfId),
              }
            );

          if (!result.deletedCount) {
            return res.status(404).send({
              success: false,
              message:
                "Turf is not in wishlist",
            });
          }

          res.send({
            success: true,
            message:
              "Turf removed from wishlist",
          });
        } catch (error) {
          console.error(
            "Remove wishlist:",
            error
          );

          res.status(500).send({
            success: false,
            message:
              "Failed to remove turf from wishlist",
          });
        }
      }
    );

    // --------------------------------------------------
    // Check Wishlist
    // --------------------------------------------------

    app.get(
      "/wishlist/check/:email/:turfId",
      async (req, res) => {
        try {
          const email = normalizeEmail(
            req.params.email
          );

          const { turfId } = req.params;

          if (!email || !turfId) {
            return res.status(400).send({
              success: false,
              message:
                "User email and turf ID are required",
            });
          }

          const wishlist =
            await wishlistCollection.findOne({
              userEmail: email,
              turfId: String(turfId),
            });

          res.send({
            success: true,
            isWishlisted: !!wishlist,
          });
        } catch (error) {
          console.error(
            "Check wishlist:",
            error
          );

          res.status(500).send({
            success: false,
            message:
              "Failed to check wishlist",
          });
        }
      }
    );

    // ==================================================
    // BOOKINGS
    // ==================================================

    // --------------------------------------------------
    // Booking Availability
    // --------------------------------------------------

    app.get(
      "/bookings/availability",
      async (req, res) => {
        try {
          const {
            turfId,
            date,
          } = req.query;

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
                turfId: String(turfId),

                date: String(date),

                status: {
                  $in: [
                    "pending",
                    "confirmed",
                  ],
                },
              })
              .sort({ startTime: 1 })
              .toArray();

          res.send(bookings);
        } catch (error) {
          console.error(
            "Availability:",
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

    // --------------------------------------------------
    // Get User Bookings
    // --------------------------------------------------

    app.get(
      "/bookings/user/:email",
      async (req, res) => {
        try {
          const email = normalizeEmail(
            req.params.email
          );

          if (!email) {
            return res.status(400).send({
              success: false,
              message:
                "User email is required",
            });
          }

          const bookings =
            await bookingsCollection
              .find({
                userEmail: email,
              })
              .sort({ createdAt: -1 })
              .toArray();

          res.send(bookings);
        } catch (error) {
          console.error(
            "User bookings:",
            error
          );

          res.status(500).send({
            success: false,
            message:
              "Failed to get user bookings",
          });
        }
      }
    );

    // --------------------------------------------------
    // Get Booking By ID
    // --------------------------------------------------

    app.get(
      "/bookings/:id",
      async (req, res) => {
        try {
          const { id } = req.params;

          if (!isValidObjectId(id)) {
            return res.status(400).send({
              success: false,
              message:
                "Invalid booking ID",
            });
          }

          const booking =
            await bookingsCollection.findOne({
              _id: new ObjectId(id),
            });

          if (!booking) {
            return res.status(404).send({
              success: false,
              message:
                "Booking not found",
            });
          }

          res.send(booking);
        } catch (error) {
          console.error(
            "Get booking:",
            error
          );

          res.status(500).send({
            success: false,
            message:
              "Failed to get booking",
          });
        }
      }
    );

    // --------------------------------------------------
    // Create Booking
    // --------------------------------------------------

    app.post(
      "/bookings",
      async (req, res) => {
        try {
          const {
            turfId,
            userEmail,
            userName,
            date,
            startTime,
            endTime,
          } = req.body;

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
                "Required booking information is missing",
            });
          }

          if (!isValidObjectId(turfId)) {
            return res.status(400).send({
              success: false,
              message:
                "Invalid turf ID",
            });
          }

          const email =
            normalizeEmail(userEmail);

          const turf =
            await turfsCollection.findOne({
              _id: new ObjectId(turfId),
              status: "approved",
            });

          if (!turf) {
            return res.status(404).send({
              success: false,
              message:
                "Approved turf not found",
            });
          }

          // Check overlapping booking
          const existingBooking =
            await bookingsCollection.findOne({
              turfId: String(turfId),

              date: String(date),

              status: {
                $in: [
                  "pending",
                  "confirmed",
                ],
              },

              startTime: {
                $lt: String(endTime),
              },

              endTime: {
                $gt: String(startTime),
              },
            });

          if (existingBooking) {
            return res.status(409).send({
              success: false,
              message:
                "This time slot is already booked",
            });
          }

          const price = Number(turf.price);

          if (
            Number.isNaN(price) ||
            price < 0
          ) {
            return res.status(400).send({
              success: false,
              message:
                "Invalid turf price",
            });
          }

          const newBooking = {
            turfId: String(turfId),

            turfName: turf.name,

            location:
              turf.location || "",

            userEmail: email,

            userName: String(
              userName || ""
            ).trim(),

            ownerEmail:
              normalizeEmail(
                turf.ownerEmail || ""
              ),

            date: String(date),

            startTime: String(startTime),

            endTime: String(endTime),

            price,

            status: "pending",

            paymentStatus: "unpaid",

            createdAt: new Date(),

            updatedAt: new Date(),
          };

          const result =
            await bookingsCollection.insertOne(
              newBooking
            );

          const booking =
            await bookingsCollection.findOne({
              _id: result.insertedId,
            });

          res.status(201).send({
            success: true,
            message:
              "Booking created successfully",

            bookingId:
              result.insertedId,

            booking,
          });
        } catch (error) {
          console.error(
            "Create booking:",
            error
          );

          res.status(500).send({
            success: false,
            message:
              "Failed to create booking",
          });
        }
      }
    );

    // --------------------------------------------------
    // Cancel Booking
    // --------------------------------------------------

    app.patch(
      "/bookings/:id/cancel",
      async (req, res) => {
        try {
          const { id } = req.params;

          if (!isValidObjectId(id)) {
            return res.status(400).send({
              success: false,
              message:
                "Invalid booking ID",
            });
          }

          const booking =
            await bookingsCollection.findOne({
              _id: new ObjectId(id),
            });

          if (!booking) {
            return res.status(404).send({
              success: false,
              message:
                "Booking not found",
            });
          }

          if (
            booking.status ===
            "cancelled"
          ) {
            return res.status(400).send({
              success: false,
              message:
                "Booking is already cancelled",
            });
          }

          if (
            booking.status ===
            "completed"
          ) {
            return res.status(400).send({
              success: false,
              message:
                "Completed booking cannot be cancelled",
            });
          }

          const result =
            await bookingsCollection.updateOne(
              {
                _id: new ObjectId(id),
              },
              {
                $set: {
                  status: "cancelled",
                  updatedAt: new Date(),
                },
              }
            );

          if (!result.modifiedCount) {
            return res.status(400).send({
              success: false,
              message:
                "Booking cancellation failed",
            });
          }

          res.send({
            success: true,
            message:
              "Booking cancelled successfully",
          });
        } catch (error) {
          console.error(
            "Cancel booking:",
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
  } catch (error) {
    console.error("Server error:", error);
  }
}

// ==================================================
// Start Server
// ==================================================

run().catch(console.dir);

app.listen(port, () => {
  console.log(
    `Khelaro Server running on port ${port}`
  );
});