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

// =========================
// Middleware
// =========================

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json({ limit: "2mb" }));

// =========================
// Cloudinary
// =========================

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// =========================
// Multer
// =========================

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

// =========================
// Helpers
// =========================

const normalizeEmail = (email = "") => {
  try {
    return decodeURIComponent(String(email))
      .trim()
      .toLowerCase();
  } catch {
    return String(email).trim().toLowerCase();
  }
};

const normalizeId = (id = "") =>
  String(id || "").trim();

const isValidObjectId = (id) =>
  ObjectId.isValid(String(id));

const toObjectId = (id) =>
  new ObjectId(String(id));

const toNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const createTurfResponse = (turf) => {
  if (!turf) return null;

  const id = String(turf._id);

  return {
    ...turf,
    _id: id,
    id,
    turfId: id,
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
          reject(error);
          return;
        }

        resolve(result);
      }
    );

    stream.end(buffer);
  });

// =========================
// MongoDB
// =========================

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

// =========================
// Basic Routes
// =========================

app.get("/", (req, res) => {
  res.send("Khelaro Server is Running");
});

app.get("/health", (req, res) => {
  res.send({
    success: true,
    message: "Khelaro API is healthy",
  });
});

// =========================
// Database
// =========================

async function run() {
  try {
    await client.connect();

    const db = client.db("khelaro");

    const usersCollection = db.collection("users");
    const turfsCollection = db.collection("turfs");
    const bookingsCollection = db.collection("bookings");
    const wishlistCollection = db.collection("wishlist");

    // =========================
    // Indexes
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

    console.log("MongoDB Connected Successfully");

    // =====================================================
    // USERS
    // =====================================================

    // Create user
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

        const existingUser =
          await usersCollection.findOne({ email });

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

        const role = [
          "user",
          "owner",
          "admin",
        ].includes(data.role)
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

        const result =
          await usersCollection.insertOne(newUser);

        const user =
          await usersCollection.findOne({
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

    // Get all users
    app.get("/users", async (req, res) => {
      try {
        const users =
          await usersCollection
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

    // Get single user
    app.get("/users/:email", async (req, res) => {
      try {
        const email = normalizeEmail(
          req.params.email
        );

        if (!email) {
          return res.status(400).send({
            success: false,
            message: "Email is required",
          });
        }

        const user =
          await usersCollection.findOne({ email });

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

    // Update profile
    app.patch("/users/:email", async (req, res) => {
      try {
        const email = normalizeEmail(
          req.params.email
        );

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

        const result =
          await usersCollection.updateOne(
            { email },
            { $set: updateData }
          );

        if (!result.matchedCount) {
          return res.status(404).send({
            success: false,
            message: "User not found",
          });
        }

        const user =
          await usersCollection.findOne({ email });

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

    // Upload profile photo
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
            await usersCollection.findOne({ email });

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

          const result =
            await uploadToCloudinary(
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
            await usersCollection.findOne({ email });

          res.send({
            success: true,
            message:
              "Profile photo uploaded successfully",
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

    // Update role
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

          const user =
            await usersCollection.findOne({ email });

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
      }
    );

    // =====================================================
    // TURFS
    // =====================================================

    // Create turf
    app.post("/turfs", async (req, res) => {
      try {
        const data = req.body || {};

        if (
          !String(data.name || "").trim() ||
          !String(data.location || "").trim() ||
          data.price === undefined ||
          !String(data.ownerEmail || "").trim()
        ) {
          return res.status(400).send({
            success: false,
            message:
              "Required turf information is missing",
          });
        }

        const price = Number(data.price);

        if (!Number.isFinite(price) || price < 0) {
          return res.status(400).send({
            success: false,
            message: "Invalid turf price",
          });
        }

        const ownerEmail = normalizeEmail(
          data.ownerEmail
        );

        const facilities = Array.isArray(
          data.facilities
        )
          ? data.facilities
          : Array.isArray(data.amenities)
          ? data.amenities
          : [];

        const now = new Date();

        const newTurf = {
          name: String(data.name).trim(),
          location: String(data.location).trim(),
          area: String(data.area || "").trim(),
          description: String(
            data.description || ""
          ).trim(),

          price,

          image: String(data.image || ""),
          images: Array.isArray(data.images)
            ? data.images
            : [],

          size: String(data.size || ""),
          surface: String(
            data.surface || "Artificial Grass"
          ),

          facilities,

          sport: String(
            data.sport || "Football"
          ),

          rating: toNumber(data.rating, 0),
          reviews: toNumber(data.reviews, 0),

          openingTime: String(
            data.openingTime || "08:00 AM"
          ),

          closingTime: String(
            data.closingTime || "11:00 PM"
          ),

          ownerEmail,
          ownerId: String(data.ownerId || ""),

          status: "pending",

          createdAt: now,
          updatedAt: now,
        };

        const result =
          await turfsCollection.insertOne(
            newTurf
          );

        const turf =
          await turfsCollection.findOne({
            _id: result.insertedId,
          });

        res.status(201).send({
          success: true,
          message: "Turf submitted successfully",
          turfId: String(result.insertedId),
          id: String(result.insertedId),
          turf: createTurfResponse(turf),
        });
      } catch (error) {
        console.error("Create turf:", error);

        res.status(500).send({
          success: false,
          message: "Failed to create turf",
        });
      }
    });

    // Get approved turfs
    app.get("/turfs", async (req, res) => {
      try {
        const query = {
          status: "approved",
        };

        if (req.query.area) {
          query.area = {
            $regex: String(req.query.area),
            $options: "i",
          };
        }

        if (req.query.sport) {
          query.sport = {
            $regex: String(req.query.sport),
            $options: "i",
          };
        }

        const turfs =
          await turfsCollection
            .find(query)
            .sort({ createdAt: -1 })
            .toArray();

        res.send(
          turfs.map(createTurfResponse)
        );
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
        const id = normalizeId(
          req.params.id
        );

        if (!id) {
          return res.status(400).send({
            success: false,
            message: "Turf ID is required",
          });
        }

        if (!isValidObjectId(id)) {
          return res.status(400).send({
            success: false,
            message: "Invalid turf ID",
          });
        }

        const turf =
          await turfsCollection.findOne({
            _id: toObjectId(id),
            status: "approved",
          });

        if (!turf) {
          return res.status(404).send({
            success: false,
            message: "Turf not found",
          });
        }

        res.send(
          createTurfResponse(turf)
        );
      } catch (error) {
        console.error("Get turf:", error);

        res.status(500).send({
          success: false,
          message: "Failed to get turf",
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

          const turfs =
            await turfsCollection
              .find({
                ownerEmail: email,
              })
              .sort({ createdAt: -1 })
              .toArray();

          res.send(
            turfs.map(createTurfResponse)
          );
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

    // Update turf
    app.patch(
      "/turfs/:id",
      async (req, res) => {
        try {
          const id = normalizeId(
            req.params.id
          );

          if (!isValidObjectId(id)) {
            return res.status(400).send({
              success: false,
              message: "Invalid turf ID",
            });
          }

          const data = {
            ...req.body,
          };

          delete data._id;
          delete data.id;
          delete data.turfId;
          delete data.status;
          delete data.ownerEmail;
          delete data.ownerId;

          if (data.name !== undefined) {
            data.name = String(data.name).trim();
          }

          if (data.location !== undefined) {
            data.location = String(
              data.location
            ).trim();
          }

          if (data.price !== undefined) {
            const price = Number(data.price);

            if (
              !Number.isFinite(price) ||
              price < 0
            ) {
              return res.status(400).send({
                success: false,
                message: "Invalid turf price",
              });
            }

            data.price = price;
          }

          if (
            data.facilities !== undefined &&
            !Array.isArray(data.facilities)
          ) {
            data.facilities = [];
          }

          if (data.images !== undefined) {
            data.images = Array.isArray(
              data.images
            )
              ? data.images
              : [];
          }

          data.updatedAt = new Date();

          const result =
            await turfsCollection.updateOne(
              {
                _id: toObjectId(id),
              },
              {
                $set: data,
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
              _id: toObjectId(id),
            });

          res.send({
            success: true,
            message: "Turf updated successfully",
            turf: createTurfResponse(turf),
          });
        } catch (error) {
          console.error("Update turf:", error);

          res.status(500).send({
            success: false,
            message: "Failed to update turf",
          });
        }
      }
    );

    // Delete turf
    app.delete(
      "/turfs/:id",
      async (req, res) => {
        try {
          const id = normalizeId(
            req.params.id
          );

          if (!isValidObjectId(id)) {
            return res.status(400).send({
              success: false,
              message: "Invalid turf ID",
            });
          }

          const objectId = toObjectId(id);

          const result =
            await turfsCollection.deleteOne({
              _id: objectId,
            });

          if (!result.deletedCount) {
            return res.status(404).send({
              success: false,
              message: "Turf not found",
            });
          }

          await Promise.all([
            wishlistCollection.deleteMany({
              turfId: id,
            }),

            bookingsCollection.deleteMany({
              turfId: id,
            }),
          ]);

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
      }
    );

    // =====================================================
    // WISHLIST
    // =====================================================

    // Check wishlist status
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
              message: "User email is required",
            });
          }

          if (!turfId) {
            return res.status(400).send({
              success: false,
              message: "Turf ID is required",
            });
          }

          if (!isValidObjectId(turfId)) {
            return res.status(400).send({
              success: false,
              message: "Invalid turf ID",
            });
          }

          const wishlist =
            await wishlistCollection.findOne({
              userEmail: email,
              turfId,
            });

          res.send({
            success: true,
            wishlisted: Boolean(wishlist),
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

    // Toggle wishlist
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
              message: "Turf ID is required",
            });
          }

          if (
            !isValidObjectId(
              normalizedTurfId
            )
          ) {
            return res.status(400).send({
              success: false,
              message: "Invalid turf ID",
            });
          }

          const user =
            await usersCollection.findOne({
              email: normalizedEmail,
            });

          if (!user) {
            return res.status(404).send({
              success: false,
              message: "User not found",
            });
          }

          const turf =
            await turfsCollection.findOne({
              _id: toObjectId(
                normalizedTurfId
              ),
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

    // Get wishlist
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
              .sort({ createdAt: -1 })
              .toArray();

          if (!wishlist.length) {
            return res.send([]);
          }

          const turfIds = wishlist
            .map((item) => item.turfId)
            .filter(isValidObjectId)
            .map(toObjectId);

          if (!turfIds.length) {
            return res.send([]);
          }

          const turfs =
            await turfsCollection
              .find({
                _id: {
                  $in: turfIds,
                },
                status: "approved",
              })
              .toArray();

          const turfMap = new Map(
            turfs.map((turf) => [
              String(turf._id),
              turf,
            ])
          );

          const result = wishlist
            .map((item) => {
              const turf =
                turfMap.get(
                  String(item.turfId)
                );

              if (!turf) return null;

              return {
                ...createWishlistResponse(
                  item
                ),

                turfId: String(
                  turf._id
                ),

                name: turf.name,
                location:
                  turf.location || "",
                area: turf.area || "",
                description:
                  turf.description || "",

                price:
                  turf.price || 0,

                image:
                  turf.image || "",

                images:
                  turf.images || [],

                size:
                  turf.size || "",

                surface:
                  turf.surface || "",

                facilities:
                  turf.facilities || [],

                amenities:
                  turf.facilities || [],

                sport:
                  turf.sport || "Football",

                rating:
                  turf.rating || 0,

                reviews:
                  turf.reviews || 0,

                openingTime:
                  turf.openingTime ||
                  "08:00 AM",

                closingTime:
                  turf.closingTime ||
                  "11:00 PM",
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
              "Failed to fetch wishlist",
          });
        }
      }
    );

    // Remove wishlist
    app.delete(
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

          if (!isValidObjectId(turfId)) {
            return res.status(400).send({
              success: false,
              message: "Invalid turf ID",
            });
          }

          const result =
            await wishlistCollection.deleteOne(
              {
                userEmail: email,
                turfId,
              }
            );

          if (!result.deletedCount) {
            return res.status(404).send({
              success: false,
              message:
                "Turf is not in wishlist",
            });
          }

          const count =
            await wishlistCollection.countDocuments(
              {
                userEmail: email,
              }
            );

          res.send({
            success: true,
            wishlisted: false,
            count,
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
              "Failed to remove wishlist",
          });
        }
      }
    );

    // =====================================================
    // BOOKINGS
    // =====================================================

    // Availability
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

          if (!turfId || !date) {
            return res.status(400).send({
              success: false,
              message:
                "Turf ID and date are required",
            });
          }

          if (!isValidObjectId(turfId)) {
            return res.status(400).send({
              success: false,
              message:
                "Invalid turf ID",
            });
          }

          if (!validateDate(date)) {
            return res.status(400).send({
              success: false,
              message: "Invalid date",
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
            "Booking availability:",
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

    // Get user bookings
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

          if (!bookings.length) {
            return res.send([]);
          }

          const turfIds = bookings
            .map(
              (booking) =>
                booking.turfId
            )
            .filter(isValidObjectId)
            .map(toObjectId);

          const turfs = turfIds.length
            ? await turfsCollection
                .find({
                  _id: {
                    $in: turfIds,
                  },
                })
                .toArray()
            : [];

          const turfMap = new Map(
            turfs.map((turf) => [
              String(turf._id),
              turf,
            ])
          );

          const result = bookings.map(
            (booking) => {
              const turf =
                turfMap.get(
                  String(
                    booking.turfId
                  )
                );

              return createBookingResponse(
                {
                  ...booking,

                  turfName:
                    turf?.name ||
                    booking.turfName ||
                    "Unknown Turf",

                  turfLocation:
                    turf?.location ||
                    booking.turfLocation ||
                    "",

                  turfImage:
                    turf?.image ||
                    booking.turfImage ||
                    "",

                  turfArea:
                    turf?.area || "",

                  turfPrice:
                    turf?.price || 0,

                  turfSport:
                    turf?.sport ||
                    "Football",
                }
              );
            }
          );

          res.send(result);
        } catch (error) {
          console.error(
            "Get user bookings:",
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

    // Create booking
    app.post(
      "/bookings",
      async (req, res) => {
        try {
          const data = req.body || {};

          const turfId = normalizeId(
            data.turfId ||
              data.turfID ||
              data.id
          );

          const userEmail =
            normalizeEmail(
              data.userEmail ||
                data.email
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

          if (!validateDate(date)) {
            return res.status(400).send({
              success: false,
              message:
                "Invalid booking date",
            });
          }

          if (
            !validateTime(startTime) ||
            !validateTime(endTime)
          ) {
            return res.status(400).send({
              success: false,
              message:
                "Invalid booking time",
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

          const turf =
            await turfsCollection.findOne({
              _id: toObjectId(turfId),
              status: "approved",
            });

          if (!turf) {
            return res.status(404).send({
              success: false,
              message:
                "Approved turf not found",
            });
          }

          // Check overlapping bookings
          const overlapping =
            await bookingsCollection.findOne(
              {
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
              }
            );

          if (overlapping) {
            return res.status(409).send({
              success: false,
              message:
                "This time slot is already booked",
            });
          }

          const requestedPrice =
            Number(data.totalPrice);

          const totalPrice =
            Number.isFinite(
              requestedPrice
            ) &&
            requestedPrice >= 0
              ? requestedPrice
              : turf.price;

          const now = new Date();

          const newBooking = {
            turfId,

            turfName: turf.name,

            turfLocation:
              turf.location || "",

            turfImage:
              turf.image || "",

            userEmail,

            userName:
              user.name || "",

            userPhone:
              user.phone || "",

            date,

            startTime,

            endTime,

            totalPrice,

            status: "pending",

            paymentStatus: "unpaid",

            paymentId: "",

            createdAt: now,
            updatedAt: now,
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
              String(result.insertedId),

            booking:
              createBookingResponse(
                booking
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
      }
    );

    // Cancel booking
    app.patch(
      "/bookings/:id/cancel",
      async (req, res) => {
        try {
          const id = normalizeId(
            req.params.id
          );

          if (!isValidObjectId(id)) {
            return res.status(400).send({
              success: false,
              message:
                "Invalid booking ID",
            });
          }

          const booking =
            await bookingsCollection.findOne(
              {
                _id: toObjectId(id),
              }
            );

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
            ].includes(
              booking.status
            )
          ) {
            return res.status(400).send({
              success: false,
              message:
                "This booking cannot be cancelled",
            });
          }

          await bookingsCollection.updateOne(
            {
              _id: toObjectId(id),
            },
            {
              $set: {
                status: "cancelled",
                updatedAt: new Date(),
              },
            }
          );

          const updated =
            await bookingsCollection.findOne(
              {
                _id: toObjectId(id),
              }
            );

          res.send({
            success: true,
            message:
              "Booking cancelled successfully",
            booking:
              createBookingResponse(
                updated
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

    // Get single booking
    app.get(
      "/bookings/:id",
      async (req, res) => {
        try {
          const id = normalizeId(
            req.params.id
          );

          if (!isValidObjectId(id)) {
            return res.status(400).send({
              success: false,
              message:
                "Invalid booking ID",
            });
          }

          const booking =
            await bookingsCollection.findOne(
              {
                _id: toObjectId(id),
              }
            );

          if (!booking) {
            return res.status(404).send({
              success: false,
              message:
                "Booking not found",
            });
          }

          const turf =
            isValidObjectId(
              booking.turfId
            )
              ? await turfsCollection.findOne(
                  {
                    _id: toObjectId(
                      booking.turfId
                    ),
                  }
                )
              : null;

          res.send(
            createBookingResponse({
              ...booking,

              turfName:
                turf?.name ||
                booking.turfName ||
                "Unknown Turf",

              turfLocation:
                turf?.location ||
                booking.turfLocation ||
                "",

              turfImage:
                turf?.image ||
                booking.turfImage ||
                "",
            })
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

    // =====================================================
    // ADMIN TURF ROUTES
    // =====================================================

    // Get all turfs
    app.get(
      "/admin/turfs",
      async (req, res) => {
        try {
          const turfs =
            await turfsCollection
              .find({})
              .sort({
                createdAt: -1,
              })
              .toArray();

          res.send(
            turfs.map(createTurfResponse)
          );
        } catch (error) {
          console.error(
            "Admin get turfs:",
            error
          );

          res.status(500).send({
            success: false,
            message:
              "Failed to get turfs",
          });
        }
      }
    );

    // Get pending turfs
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

          res.send(
            turfs.map(createTurfResponse)
          );
        } catch (error) {
          console.error(
            "Get pending turfs:",
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

    // Approve turf
    app.patch(
      "/admin/turfs/:id/approve",
      async (req, res) => {
        try {
          const id = normalizeId(
            req.params.id
          );

          if (!isValidObjectId(id)) {
            return res.status(400).send({
              success: false,
              message:
                "Invalid turf ID",
            });
          }

          const result =
            await turfsCollection.updateOne(
              {
                _id: toObjectId(id),
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
              message:
                "Turf not found",
            });
          }

          const turf =
            await turfsCollection.findOne({
              _id: toObjectId(id),
            });

          res.send({
            success: true,
            message:
              "Turf approved successfully",
            turf:
              createTurfResponse(turf),
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

    // Reject turf
    app.patch(
      "/admin/turfs/:id/reject",
      async (req, res) => {
        try {
          const id = normalizeId(
            req.params.id
          );

          if (!isValidObjectId(id)) {
            return res.status(400).send({
              success: false,
              message:
                "Invalid turf ID",
            });
          }

          const result =
            await turfsCollection.updateOne(
              {
                _id: toObjectId(id),
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
              message:
                "Turf not found",
            });
          }

          const turf =
            await turfsCollection.findOne({
              _id: toObjectId(id),
            });

          res.send({
            success: true,
            message:
              "Turf rejected successfully",
            turf:
              createTurfResponse(turf),
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

    // =====================================================
    // 404
    // =====================================================

    app.use((req, res) => {
      res.status(404).send({
        success: false,
        message: "API route not found",
        path: req.originalUrl,
      });
    });

    // =====================================================
    // Error Handler
    // =====================================================

    app.use((error, req, res, next) => {
      console.error("Server error:", error);

      if (
        error instanceof multer.MulterError
      ) {
        return res.status(400).send({
          success: false,
          message:
            error.message ||
            "File upload error",
        });
      }

      res.status(500).send({
        success: false,
        message:
          error?.message ||
          "Internal server error",
      });
    });
  } catch (error) {
    console.error(
      "Database connection error:",
      error
    );

    process.exit(1);
  }
}

// =========================
// Start Server
// =========================

run().catch((error) => {
  console.error("Server startup error:", error);
  process.exit(1);
});

app.listen(port, () => {
  console.log(
    `Khelaro server running on port ${port}`
  );
});