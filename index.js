const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const dns = require("node:dns");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");
const {
  MongoClient,
  ServerApiVersion,
  ObjectId,
} = require("mongodb");

dotenv.config();

dns.setServers(["1.1.1.1", "8.8.8.8"]);

const app = express();
const port = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" }));

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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
      cb(new Error("Only JPG, PNG and WEBP images are allowed"));
    }
  },
});

const normalizeEmail = (email = "") => {
  try {
    return decodeURIComponent(String(email))
      .trim()
      .toLowerCase();
  } catch {
    return String(email).trim().toLowerCase();
  }
};

const normalizeId = (id = "") => String(id || "").trim();

const toNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const isValidObjectId = (id) => ObjectId.isValid(String(id));

const toObjectId = (id) =>
  isValidObjectId(id) ? new ObjectId(id) : null;

const normalizeTurfResponse = (turf) => {
  if (!turf) return null;

  const mongoId = turf._id ? String(turf._id) : "";

  return {
    ...turf,
    _id: mongoId,
    id: turf.id ? String(turf.id) : mongoId,
    turfId: turf.turfId
      ? String(turf.turfId)
      : turf.id
        ? String(turf.id)
        : mongoId,
  };
};

const createBookingResponse = (booking) => {
  if (!booking) return null;

  return {
    ...booking,
    _id: String(booking._id),
    id: String(booking._id),
    bookingId: String(booking._id),
    turfId: String(booking.turfId),
  };
};

const createWishlistResponse = (item) => {
  if (!item) return null;

  return {
    ...item,
    _id: String(item._id),
    id: String(item._id),
    wishlistId: String(item._id),
    turfId: String(item.turfId),
  };
};

const validateDate = (date) => {
  if (!date) return false;

  const value = String(date).trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00`);

  return !Number.isNaN(parsed.getTime());
};

const validateTime = (time) => {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(
    String(time || "")
  );
};

const uploadToCloudinary = (buffer, options = {}) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "khelaro",
        resource_type: "image",
        ...options,
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }

        resolve(result);
      }
    );

    stream.end(buffer);
  });

const dbUser = process.env.DB_USER;
const dbPass = process.env.DB_PASS;

if (!dbUser || !dbPass) {
  console.error(
    "DB_USER or DB_PASS is missing from environment variables."
  );
}

const uri = `mongodb+srv://${encodeURIComponent(
  dbUser || ""
)}:${encodeURIComponent(
  dbPass || ""
)}@cluster0.yvhjyyn.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

app.get("/", (req, res) => {
  res.send("Khelaro Server is Running");
});

app.get("/health", (req, res) => {
  res.send({
    success: true,
    message: "Khelaro API is healthy",
  });
});

async function run() {
  try {
    await client.connect();

    const db = client.db("khelaro");

    const usersCollection = db.collection("users");
    const turfsCollection = db.collection("turfs");
    const bookingsCollection = db.collection("bookings");
    const wishlistCollection = db.collection("wishlist");

    // =========================
    // INDEXES
    // =========================

    await usersCollection.createIndex(
      { email: 1 },
      {
        unique: true,
        name: "unique_user_email",
      }
    );

    await turfsCollection.createIndex(
      { status: 1, createdAt: -1 },
      {
        name: "turfs_status_createdAt",
      }
    );

    await turfsCollection.createIndex(
      { ownerEmail: 1, createdAt: -1 },
      {
        name: "turfs_owner_createdAt",
      }
    );

    await bookingsCollection.createIndex(
      {
        userEmail: 1,
        date: -1,
      },
      {
        name: "bookings_user_date",
      }
    );

    await bookingsCollection.createIndex(
      {
        turfId: 1,
        date: 1,
        startTime: 1,
      },
      {
        name: "bookings_turf_date_time",
      }
    );

    await wishlistCollection.createIndex(
      {
        userEmail: 1,
        turfId: 1,
      },
      {
        unique: true,
        name: "unique_user_turf_wishlist",
      }
    );

    await wishlistCollection.createIndex(
      {
        userEmail: 1,
        createdAt: -1,
      },
      {
        name: "wishlist_user_createdAt",
      }
    );

    console.log("MongoDB Connected Successfully");

    // =========================
    // USERS
    // =========================

    app.post("/users", async (req, res) => {
      try {
        const data = req.body || {};

        if (!data.email) {
          return res.status(400).send({
            success: false,
            message: "Email is required",
          });
        }

        const email = normalizeEmail(data.email);

        const existingUser = await usersCollection.findOne({
          email,
        });

        if (existingUser) {
          return res.send({
            success: true,
            message: "User already exists",
            user: {
              ...existingUser,
              _id: String(existingUser._id),
            },
          });
        }

        const allowedRoles = [
          "user",
          "owner",
          "admin",
        ];

        const role = allowedRoles.includes(data.role)
          ? data.role
          : "user";

        const now = new Date();

        const newUser = {
          uid: String(data.uid || ""),
          name: String(data.name || "").trim(),
          email,
          phone: String(data.phone || "").trim(),
          location: String(data.location || "").trim(),
          photoURL: String(data.photoURL || ""),
          role,
          createdAt: now,
          updatedAt: now,
        };

        const result = await usersCollection.insertOne(
          newUser
        );

        const user = await usersCollection.findOne({
          _id: result.insertedId,
        });

        res.status(201).send({
          success: true,
          message: "User created successfully",
          user: {
            ...user,
            _id: String(user._id),
          },
        });
      } catch (error) {
        console.error("Create user:", error);

        if (error?.code === 11000) {
          return res.status(409).send({
            success: false,
            message: "User already exists",
          });
        }

        res.status(500).send({
          success: false,
          message: "Failed to create user",
        });
      }
    });

    app.get("/users", async (req, res) => {
      try {
        const users = await usersCollection
          .find({})
          .sort({ createdAt: -1 })
          .toArray();

        res.send(
          users.map((user) => ({
            ...user,
            _id: String(user._id),
          }))
        );
      } catch (error) {
        console.error("Get users:", error);

        res.status(500).send({
          success: false,
          message: "Failed to get users",
        });
      }
    });

    app.get("/users/:email", async (req, res) => {
      try {
        const email = normalizeEmail(req.params.email);

        if (!email) {
          return res.status(400).send({
            success: false,
            message: "Email is required",
          });
        }

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
          user: {
            ...user,
            _id: String(user._id),
          },
        });
      } catch (error) {
        console.error("Get user:", error);

        res.status(500).send({
          success: false,
          message: "Failed to get user",
        });
      }
    });

    app.patch("/users/:email", async (req, res) => {
      try {
        const email = normalizeEmail(req.params.email);

        const {
          name,
          phone,
          location,
          photoURL,
        } = req.body;

        if (!String(name || "").trim()) {
          return res.status(400).send({
            success: false,
            message: "Name is required",
          });
        }

        const updateData = {
          name: String(name).trim(),
          phone: String(phone || "").trim(),
          location: String(location || "").trim(),
          updatedAt: new Date(),
        };

        if (photoURL !== undefined) {
          updateData.photoURL = String(photoURL);
        }

        const result = await usersCollection.updateOne(
          { email },
          {
            $set: updateData,
          }
        );

        if (!result.matchedCount) {
          return res.status(404).send({
            success: false,
            message: "User not found",
          });
        }

        const user = await usersCollection.findOne({
          email,
        });

        res.send({
          success: true,
          message: "Profile updated successfully",
          user: {
            ...user,
            _id: String(user._id),
          },
        });
      } catch (error) {
        console.error("Update profile:", error);

        res.status(500).send({
          success: false,
          message: "Failed to update profile",
        });
      }
    });

    app.post(
      "/users/:email/photo",
      upload.single("photo"),
      async (req, res) => {
        try {
          const email = normalizeEmail(req.params.email);

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

          const user = await usersCollection.findOne({
            email,
          });

          if (!user) {
            return res.status(404).send({
              success: false,
              message: "User not found",
            });
          }

          const publicId = `user-${email.replace(
            /[^a-zA-Z0-9]/g,
            "_"
          )}`;

          const result = await uploadToCloudinary(
            req.file.buffer,
            {
              folder: "khelaro/profile-photos",
              public_id: publicId,
              overwrite: true,
            }
          );

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
            message: "Profile photo uploaded successfully",
            photoURL: result.secure_url,
            user: {
              ...updatedUser,
              _id: String(updatedUser._id),
            },
          });
        } catch (error) {
          console.error(
            "Upload profile photo:",
            error
          );

          res.status(500).send({
            success: false,
            message:
              error?.message ||
              "Failed to upload profile photo",
          });
        }
      }
    );

    app.patch("/users/:email/role", async (req, res) => {
      try {
        const email = normalizeEmail(req.params.email);
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

        const result = await usersCollection.updateOne(
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

        const user = await usersCollection.findOne({
          email,
        });

        res.send({
          success: true,
          message: `User role updated to ${role}`,
          user: {
            ...user,
            _id: String(user._id),
          },
        });
      } catch (error) {
        console.error("Update role:", error);

        res.status(500).send({
          success: false,
          message: "Failed to update user role",
        });
      }
    });

    // =========================
    // TURFS
    // =========================

    // Get approved turfs
    app.get("/turfs", async (req, res) => {
      try {
        const turfs = await turfsCollection
          .find({
            status: "approved",
          })
          .sort({
            createdAt: -1,
          })
          .toArray();

        res.send({
          success: true,
          turfs: turfs.map(normalizeTurfResponse),
        });
      } catch (error) {
        console.error("Get turfs:", error);

        res.status(500).send({
          success: false,
          message: "Failed to get turfs",
        });
      }
    });

    // Get single approved turf
    app.get("/turfs/:id", async (req, res) => {
      try {
        const turfId = normalizeId(req.params.id);

        if (!turfId) {
          return res.status(400).send({
            success: false,
            message: "Turf ID is required",
          });
        }

        let turf = null;

        if (isValidObjectId(turfId)) {
          turf = await turfsCollection.findOne({
            _id: new ObjectId(turfId),
            status: "approved",
          });
        }

        if (!turf) {
          turf = await turfsCollection.findOne({
            $or: [
              { id: turfId },
              { turfId },
            ],
            status: "approved",
          });
        }

        if (!turf) {
          return res.status(404).send({
            success: false,
            message: "Turf not found",
          });
        }

        res.send({
          success: true,
          turf: normalizeTurfResponse(turf),
        });
      } catch (error) {
        console.error("Get turf:", error);

        res.status(500).send({
          success: false,
          message: "Failed to get turf details",
        });
      }
    });

    // Owner turfs
    app.get(
      "/owner/turfs/:email",
      async (req, res) => {
        try {
          const email = normalizeEmail(
            req.params.email
          );

          if (!email) {
            return res.status(400).send({
              success: false,
              message: "Owner email is required",
            });
          }

          const turfs = await turfsCollection
            .find({
              ownerEmail: email,
            })
            .sort({
              createdAt: -1,
            })
            .toArray();

          res.send({
            success: true,
            turfs: turfs.map(normalizeTurfResponse),
          });
        } catch (error) {
          console.error(
            "Get owner turfs:",
            error
          );

          res.status(500).send({
            success: false,
            message: "Failed to get owner turfs",
          });
        }
      }
    );

    // Create turf
    app.post("/turfs", async (req, res) => {
      try {
        const data = req.body || {};

        const ownerEmail = normalizeEmail(
          data.ownerEmail ||
            data.email
        );

        const name = String(
          data.name || ""
        ).trim();

        if (!ownerEmail) {
          return res.status(400).send({
            success: false,
            message: "Owner email is required",
          });
        }

        if (!name) {
          return res.status(400).send({
            success: false,
            message: "Turf name is required",
          });
        }

        const owner = await usersCollection.findOne({
          email: ownerEmail,
        });

        if (!owner) {
          return res.status(404).send({
            success: false,
            message: "Owner not found",
          });
        }

        const now = new Date();

        const turf = {
          name,
          slug: String(data.slug || "")
            .trim()
            .toLowerCase(),
          location: String(
            data.location || ""
          ).trim(),
          area: String(
            data.area || ""
          ).trim(),
          sport: String(
            data.sport || "Football"
          ).trim(),
          price: toNumber(data.price, 0),
          rating: toNumber(data.rating, 0),
          reviews: toNumber(data.reviews, 0),
          image: String(
            data.image || ""
          ).trim(),
          size: String(
            data.size || ""
          ).trim(),
          surface: String(
            data.surface || ""
          ).trim(),
          openingTime: String(
            data.openingTime || "08:00 AM"
          ).trim(),
          closingTime: String(
            data.closingTime || "11:00 PM"
          ).trim(),
          description: String(
            data.description || ""
          ).trim(),
          facilities: Array.isArray(
            data.facilities
          )
            ? data.facilities
                .map((item) => String(item).trim())
                .filter(Boolean)
            : [],
          ownerEmail,
          ownerName: String(
            data.ownerName ||
              owner.name ||
              ""
          ).trim(),
          status: "pending",
          createdAt: now,
          updatedAt: now,
        };

        const result =
          await turfsCollection.insertOne(turf);

        const createdTurf =
          await turfsCollection.findOne({
            _id: result.insertedId,
          });

        res.status(201).send({
          success: true,
          message:
            "Turf submitted for approval",
          turf: normalizeTurfResponse(
            createdTurf
          ),
        });
      } catch (error) {
        console.error("Create turf:", error);

        res.status(500).send({
          success: false,
          message: "Failed to create turf",
        });
      }
    });

    // Upload turf image
    app.post(
      "/turfs/upload-image",
      upload.single("image"),
      async (req, res) => {
        try {
          if (!req.file) {
            return res.status(400).send({
              success: false,
              message: "Turf image is required",
            });
          }

          const result = await uploadToCloudinary(
            req.file.buffer,
            {
              folder: "khelaro/turfs",
            }
          );

          res.send({
            success: true,
            message: "Turf image uploaded successfully",
            image: result.secure_url,
          });
        } catch (error) {
          console.error(
            "Upload turf image:",
            error
          );

          res.status(500).send({
            success: false,
            message:
              error?.message ||
              "Failed to upload turf image",
          });
        }
      }
    );

    // Admin: all turfs
    app.get("/admin/turfs", async (req, res) => {
      try {
        const turfs = await turfsCollection
          .find({})
          .sort({
            createdAt: -1,
          })
          .toArray();

        res.send({
          success: true,
          turfs: turfs.map(normalizeTurfResponse),
        });
      } catch (error) {
        console.error(
          "Admin get turfs:",
          error
        );

        res.status(500).send({
          success: false,
          message: "Failed to get turfs",
        });
      }
    });

    // Admin: pending turfs
    app.get(
      "/admin/turfs/pending",
      async (req, res) => {
        try {
          const turfs = await turfsCollection
            .find({
              status: "pending",
            })
            .sort({
              createdAt: -1,
            })
            .toArray();

          res.send({
            success: true,
            turfs: turfs.map(
              normalizeTurfResponse
            ),
          });
        } catch (error) {
          console.error(
            "Admin pending turfs:",
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

    // Admin: approve turf
    app.patch(
      "/admin/turfs/:id/approve",
      async (req, res) => {
        try {
          const turfId = normalizeId(
            req.params.id
          );

          if (!isValidObjectId(turfId)) {
            return res.status(400).send({
              success: false,
              message: "Invalid turf ID",
            });
          }

          const result =
            await turfsCollection.updateOne(
              {
                _id: new ObjectId(turfId),
              },
              {
                $set: {
                  status: "approved",
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

          const turf =
            await turfsCollection.findOne({
              _id: new ObjectId(turfId),
            });

          res.send({
            success: true,
            message: "Turf approved successfully",
            turf: normalizeTurfResponse(turf),
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

    // Admin: reject turf
    app.patch(
      "/admin/turfs/:id/reject",
      async (req, res) => {
        try {
          const turfId = normalizeId(
            req.params.id
          );

          if (!isValidObjectId(turfId)) {
            return res.status(400).send({
              success: false,
              message: "Invalid turf ID",
            });
          }

          const result =
            await turfsCollection.updateOne(
              {
                _id: new ObjectId(turfId),
              },
              {
                $set: {
                  status: "rejected",
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

          const turf =
            await turfsCollection.findOne({
              _id: new ObjectId(turfId),
            });

          res.send({
            success: true,
            message: "Turf rejected successfully",
            turf: normalizeTurfResponse(turf),
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

    // Admin: delete turf
    app.delete(
      "/admin/turfs/:id",
      async (req, res) => {
        try {
          const turfId = normalizeId(
            req.params.id
          );

          if (!isValidObjectId(turfId)) {
            return res.status(400).send({
              success: false,
              message: "Invalid turf ID",
            });
          }

          const result =
            await turfsCollection.deleteOne({
              _id: new ObjectId(turfId),
            });

          if (!result.deletedCount) {
            return res.status(404).send({
              success: false,
              message: "Turf not found",
            });
          }

          res.send({
            success: true,
            message: "Turf deleted successfully",
          });
        } catch (error) {
          console.error(
            "Delete turf:",
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

    // =========================
    // BOOKINGS
    // =========================

    app.get(
      "/bookings/availability",
      async (req, res) => {
        try {
          const turfId = normalizeId(
            req.query.turfId
          );

          const date = String(
            req.query.date || ""
          ).trim();

          if (!turfId) {
            return res.status(400).send({
              success: false,
              message: "Turf ID is required",
            });
          }

          if (!validateDate(date)) {
            return res.status(400).send({
              success: false,
              message: "Valid date is required",
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

          res.send(
            bookings.map(
              createBookingResponse
            )
          );
        } catch (error) {
          console.error(
            "Get booking availability:",
            error
          );

          res.status(500).send({
            success: false,
            message:
              "Failed to get booking availability",
          });
        }
      }
    );

    app.post("/bookings", async (req, res) => {
      try {
        const data = req.body || {};

        const turfId = normalizeId(
          data.turfId || data.id
        );

        const userEmail = normalizeEmail(
          data.userEmail || data.email
        );

        const date = String(
          data.date || ""
        ).trim();

        const startTime = String(
          data.startTime || ""
        ).trim();

        const endTime = String(
          data.endTime || ""
        ).trim();

        if (!turfId) {
          return res.status(400).send({
            success: false,
            message: "Turf ID is required",
          });
        }

        if (!userEmail) {
          return res.status(400).send({
            success: false,
            message: "User email is required",
          });
        }

        if (!validateDate(date)) {
          return res.status(400).send({
            success: false,
            message: "Valid date is required",
          });
        }

        if (
          !validateTime(startTime) ||
          !validateTime(endTime)
        ) {
          return res.status(400).send({
            success: false,
            message:
              "Valid start and end time are required",
          });
        }

        if (startTime >= endTime) {
          return res.status(400).send({
            success: false,
            message:
              "End time must be after start time",
          });
        }

        const user =
          await usersCollection.findOne({
            email: userEmail,
          });

        if (!user) {
          return res.status(404).send({
            success: false,
            message: "User not found",
          });
        }

        let turf = null;

        if (isValidObjectId(turfId)) {
          turf =
            await turfsCollection.findOne({
              _id: new ObjectId(turfId),
              status: "approved",
            });
        }

        if (!turf) {
          turf =
            await turfsCollection.findOne({
              $or: [
                { id: turfId },
                { turfId },
              ],
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

        const conflictingBooking =
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

        if (conflictingBooking) {
          return res.status(409).send({
            success: false,
            message:
              "This turf is already booked for the selected time",
          });
        }

        const now = new Date();

        const booking = {
          turfId,
          userEmail,

          userName: String(
            data.userName ||
              user.name ||
              ""
          ).trim(),

          userPhone: String(
            data.userPhone ||
              user.phone ||
              ""
          ).trim(),

          turfName: String(
            turf.name || ""
          ).trim(),

          turfLocation: String(
            turf.location ||
              turf.area ||
              ""
          ).trim(),

          date,
          startTime,
          endTime,

          price: toNumber(
            turf.price,
            toNumber(data.price, 0)
          ),

          paymentStatus: "unpaid",

          paymentMethod: String(
            data.paymentMethod || ""
          ).trim(),

          status: "pending",

          notes: String(
            data.notes || ""
          ).trim(),

          createdAt: now,
          updatedAt: now,
        };

        const result =
          await bookingsCollection.insertOne(
            booking
          );

        const createdBooking =
          await bookingsCollection.findOne({
            _id: result.insertedId,
          });

        res.status(201).send({
          success: true,
          message:
            "Booking created successfully",
          booking:
            createBookingResponse(
              createdBooking
            ),
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
    });

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
              .sort({
                date: -1,
                startTime: -1,
              })
              .toArray();

          res.send(
            bookings.map(
              createBookingResponse
            )
          );
        } catch (error) {
          console.error(
            "Get user bookings:",
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

    app.get(
      "/bookings/:id",
      async (req, res) => {
        try {
          const bookingId = normalizeId(
            req.params.id
          );

          if (!isValidObjectId(bookingId)) {
            return res.status(400).send({
              success: false,
              message:
                "Invalid booking ID",
            });
          }

          const booking =
            await bookingsCollection.findOne({
              _id: new ObjectId(bookingId),
            });

          if (!booking) {
            return res.status(404).send({
              success: false,
              message:
                "Booking not found",
            });
          }

          res.send(
            createBookingResponse(
              booking
            )
          );
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

    app.patch(
      "/bookings/:id/cancel",
      async (req, res) => {
        try {
          const bookingId = normalizeId(
            req.params.id
          );

          if (!isValidObjectId(bookingId)) {
            return res.status(400).send({
              success: false,
              message:
                "Invalid booking ID",
            });
          }

          const booking =
            await bookingsCollection.findOne({
              _id: new ObjectId(bookingId),
            });

          if (!booking) {
            return res.status(404).send({
              success: false,
              message:
                "Booking not found",
            });
          }

          if (
            [
              "cancelled",
              "completed",
            ].includes(booking.status)
          ) {
            return res.status(400).send({
              success: false,
              message:
                "This booking cannot be cancelled",
            });
          }

          await bookingsCollection.updateOne(
            {
              _id: new ObjectId(bookingId),
            },
            {
              $set: {
                status: "cancelled",
                updatedAt: new Date(),
              },
            }
          );

          const updatedBooking =
            await bookingsCollection.findOne({
              _id: new ObjectId(bookingId),
            });

          res.send({
            success: true,
            message:
              "Booking cancelled successfully",
            booking:
              createBookingResponse(
                updatedBooking
              ),
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

    // =========================
    // WISHLIST
    // =========================

    app.get(
      "/wishlist/:email/:turfId",
      async (req, res) => {
        try {
          const email = normalizeEmail(
            req.params.email
          );

          const turfId = normalizeId(
            req.params.turfId
          );

          if (!email) {
            return res.status(400).send({
              success: false,
              message:
                "User email is required",
            });
          }

          if (!turfId) {
            return res.status(400).send({
              success: false,
              message:
                "Turf ID is required",
            });
          }

          const wishlist =
            await wishlistCollection.findOne({
              userEmail: email,
              turfId,
            });

          res.send({
            success: true,
            wishlisted: Boolean(
              wishlist
            ),
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

    app.post(
      "/wishlist/toggle",
      async (req, res) => {
        try {
          const {
            userEmail,
            email,
            turfId,
            id,
          } = req.body || {};

          const normalizedEmail =
            normalizeEmail(
              userEmail || email
            );

          const normalizedTurfId =
            normalizeId(
              turfId || id
            );

          if (!normalizedEmail) {
            return res.status(400).send({
              success: false,
              message:
                "User email is required",
            });
          }

          if (!normalizedTurfId) {
            return res.status(400).send({
              success: false,
              message:
                "Turf ID is required",
            });
          }

          const user =
            await usersCollection.findOne({
              email: normalizedEmail,
            });

          if (!user) {
            return res.status(404).send({
              success: false,
              message:
                "User not found",
            });
          }

          const existing =
            await wishlistCollection.findOne({
              userEmail: normalizedEmail,
              turfId: normalizedTurfId,
            });

          if (existing) {
            await wishlistCollection.deleteOne({
              _id: existing._id,
            });

            const count =
              await wishlistCollection.countDocuments(
                {
                  userEmail:
                    normalizedEmail,
                }
              );

            return res.send({
              success: true,
              wishlisted: false,
              count,
              message:
                "Turf removed from wishlist",
            });
          }

          const now = new Date();

          await wishlistCollection.insertOne({
            userEmail: normalizedEmail,
            turfId: normalizedTurfId,
            createdAt: now,
            updatedAt: now,
          });

          const count =
            await wishlistCollection.countDocuments(
              {
                userEmail:
                  normalizedEmail,
              }
            );

          res.status(201).send({
            success: true,
            wishlisted: true,
            count,
            message:
              "Turf added to wishlist",
          });
        } catch (error) {
          console.error(
            "Wishlist toggle:",
            error
          );

          if (error?.code === 11000) {
            return res.status(409).send({
              success: false,
              message:
                "Turf is already in wishlist",
            });
          }

          res.status(500).send({
            success: false,
            message:
              "Wishlist operation failed",
          });
        }
      }
    );

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

          const wishlist =
            await wishlistCollection
              .find({
                userEmail: email,
              })
              .sort({
                createdAt: -1,
              })
              .toArray();

          res.send(
            wishlist.map(
              createWishlistResponse
            )
          );
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

    console.log(
      "Khelaro API routes registered"
    );
  } catch (error) {
    console.error(
      "MongoDB connection error:",
      error
    );
  }
}

run().catch(console.error);

app.listen(port, () => {
  console.log(
    `Server is running on port ${port}`
  );
});