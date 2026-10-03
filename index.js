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

// =====================================================
// DNS
// =====================================================

dns.setServers(["1.1.1.1", "8.8.8.8"]);

// =====================================================
// APP
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

// =====================================================
// CLOUDINARY
// =====================================================

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// =====================================================
// MULTER
// =====================================================

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

// =====================================================
// HELPERS
// =====================================================

const normalizeEmail = (email = "") => {
  try {
    return decodeURIComponent(String(email))
      .trim()
      .toLowerCase();
  } catch {
    return String(email).trim().toLowerCase();
  }
};

const normalizeTurfId = (id = "") => {
  return String(id).trim();
};

const isValidObjectId = (id) => {
  return ObjectId.isValid(String(id));
};

const toObjectId = (id) => {
  return new ObjectId(String(id));
};

// =====================================================
// MONGODB URI
// =====================================================

const uri = `mongodb+srv://${encodeURIComponent(
  process.env.DB_USER
)}:${encodeURIComponent(
  process.env.DB_PASS
)}@cluster0.yvhjyyn.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// =====================================================
// MONGODB CLIENT
// =====================================================

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// =====================================================
// BASIC ROUTES
// =====================================================

app.get("/", (req, res) => {
  res.send("Khelaro Server is Running");
});

app.get("/health", (req, res) => {
  res.send({
    success: true,
    message: "Khelaro API is healthy",
  });
});

// =====================================================
// INDEX HELPER
// =====================================================

/**
 * Creates an index safely.
 *
 * MongoDB can already have the same key pattern
 * under a different name. This helper detects that
 * situation and fixes it automatically.
 */
const ensureIndex = async (
  collection,
  key,
  options = {}
) => {
  const indexes = await collection
    .listIndexes()
    .toArray();

  const existingIndex = indexes.find(
    (index) =>
      JSON.stringify(index.key) ===
      JSON.stringify(key)
  );

  // No existing index with this key pattern
  if (!existingIndex) {
    await collection.createIndex(
      key,
      options
    );

    return;
  }

  const desiredName =
    options.name ||
    Object.entries(key)
      .map(([field, direction]) => {
        return `${field}_${direction}`;
      })
      .join("_");

  const existingName =
    existingIndex.name;

  const existingUnique =
    Boolean(existingIndex.unique);

  const desiredUnique =
    Boolean(options.unique);

  // Existing index is already correct
  if (
    existingName === desiredName &&
    existingUnique === desiredUnique
  ) {
    return;
  }

  // Same key but wrong name/options.
  // Drop it first, then recreate correctly.
  console.log(
    `Updating MongoDB index: ${existingName}`
  );

  await collection.dropIndex(
    existingName
  );

  await collection.createIndex(
    key,
    options
  );

  console.log(
    `MongoDB index created: ${desiredName}`
  );
};

// =====================================================
// DATABASE
// =====================================================

async function run() {
  try {
    // -------------------------------------------------
    // CONNECT
    // -------------------------------------------------

    await client.connect();

    const db = client.db("khelaro");

    const usersCollection =
      db.collection("users");

    const turfsCollection =
      db.collection("turfs");

    const bookingsCollection =
      db.collection("bookings");

    const wishlistCollection =
      db.collection("wishlist");

    // =================================================
    // INDEXES
    // =================================================

    /*
      IMPORTANT

      The old database may already contain:

      userEmail_1_turfId_1

      while the new code wants:

      unique_user_turf_wishlist

      ensureIndex() handles this automatically.
    */

    await ensureIndex(
      wishlistCollection,
      {
        userEmail: 1,
        turfId: 1,
      },
      {
        unique: true,
        name: "unique_user_turf_wishlist",
      }
    );

    await ensureIndex(
      wishlistCollection,
      {
        userEmail: 1,
        createdAt: -1,
      },
      {
        name: "wishlist_user_createdAt",
      }
    );

    await ensureIndex(
      bookingsCollection,
      {
        userEmail: 1,
        date: -1,
      },
      {
        name: "bookings_user_date",
      }
    );

    await ensureIndex(
      bookingsCollection,
      {
        turfId: 1,
        date: 1,
        startTime: 1,
      },
      {
        name: "bookings_turf_date_time",
      }
    );

    console.log(
      "MongoDB Connected Successfully"
    );

    // =================================================
    // USERS API
    // =================================================

    // -------------------------------------------------
    // CREATE USER
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

        const email = normalizeEmail(
          user.email
        );

        const existingUser =
          await usersCollection.findOne({
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

        const result =
          await usersCollection.insertOne(
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
        console.error(
          "Create user:",
          error
        );

        res.status(500).send({
          success: false,
          message:
            "Failed to create user",
        });
      }
    });

    // -------------------------------------------------
    // GET ALL USERS
    // -------------------------------------------------

    app.get("/users", async (req, res) => {
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
          "Get users:",
          error
        );

        res.status(500).send({
          success: false,
          message:
            "Failed to get users",
        });
      }
    });

    // -------------------------------------------------
    // GET USER BY EMAIL
    // -------------------------------------------------

    app.get(
      "/users/:email",
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

          res.send({
            success: true,
            user,
          });
        } catch (error) {
          console.error(
            "Get user:",
            error
          );

          res.status(500).send({
            success: false,
            message:
              "Failed to get user",
          });
        }
      }
    );

    // -------------------------------------------------
    // UPDATE USER PROFILE
    // -------------------------------------------------

    app.patch(
      "/users/:email",
      async (req, res) => {
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

          if (!name || !name.trim()) {
            return res.status(400).send({
              success: false,
              message:
                "Name is required",
            });
          }

          const updateData = {
            name: name.trim(),
            phone: String(
              phone || ""
            ).trim(),
            location: String(
              location || ""
            ).trim(),
            updatedAt: new Date(),
          };

          if (
            photoURL !== undefined
          ) {
            updateData.photoURL =
              photoURL;
          }

          const result =
            await usersCollection.updateOne(
              {
                email,
              },
              {
                $set: updateData,
              }
            );

          if (
            result.matchedCount === 0
          ) {
            return res.status(404).send({
              success: false,
              message:
                "User not found",
            });
          }

          const updatedUser =
            await usersCollection.findOne({
              email,
            });

          res.send({
            success: true,
            message:
              "Profile updated successfully",
            user: updatedUser,
          });
        } catch (error) {
          console.error(
            "Update profile:",
            error
          );

          res.status(500).send({
            success: false,
            message:
              "Failed to update profile",
          });
        }
      }
    );

    // -------------------------------------------------
    // UPLOAD PROFILE PHOTO
    // -------------------------------------------------

    app.post(
      "/users/:email/photo",
      upload.single("photo"),
      async (req, res) => {
        try {
          const email =
            normalizeEmail(
              req.params.email
            );

          if (!email) {
            return res.status(400).send({
              success: false,
              message:
                "User email is required",
            });
          }

          if (!req.file) {
            return res.status(400).send({
              success: false,
              message:
                "Profile photo is required",
            });
          }

          const user =
            await usersCollection.findOne({
              email,
            });

          if (!user) {
            return res.status(404).send({
              success: false,
              message:
                "User not found",
            });
          }

          const uploadToCloudinary =
            () => {
              return new Promise(
                (
                  resolve,
                  reject
                ) => {
                  const stream =
                    cloudinary.uploader.upload_stream(
                      {
                        folder:
                          "khelaro/profile-photos",

                        public_id:
                          `user-${email.replace(
                            /[^a-zA-Z0-9]/g,
                            "_"
                          )}`,

                        overwrite: true,
                        resource_type:
                          "image",
                      },

                      (
                        error,
                        result
                      ) => {
                        if (error) {
                          reject(
                            error
                          );
                        } else {
                          resolve(
                            result
                          );
                        }
                      }
                    );

                  stream.end(
                    req.file.buffer
                  );
                }
              );
            };

          const result =
            await uploadToCloudinary();

          await usersCollection.updateOne(
            {
              email,
            },
            {
              $set: {
                photoURL:
                  result.secure_url,
                updatedAt:
                  new Date(),
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
            photoURL:
              result.secure_url,
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

    // -------------------------------------------------
    // UPDATE ROLE
    // -------------------------------------------------

    app.patch(
      "/users/:email/role",
      async (req, res) => {
        try {
          const email =
            normalizeEmail(
              req.params.email
            );

          const { role } =
            req.body;

          const allowedRoles = [
            "user",
            "owner",
            "admin",
          ];

          if (
            !allowedRoles.includes(
              role
            )
          ) {
            return res.status(400).send({
              success: false,
              message:
                "Invalid role",
            });
          }

          const result =
            await usersCollection.updateOne(
              {
                email,
              },
              {
                $set: {
                  role,
                  updatedAt:
                    new Date(),
                },
              }
            );

          if (!result.matchedCount) {
            return res.status(404).send({
              success: false,
              message:
                "User not found",
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
            message:
              "Failed to update user role",
          });
        }
      }
    );

    // =================================================
    // TURFS API
    // =================================================

    // -------------------------------------------------
    // CREATE TURF
    // -------------------------------------------------

    app.post(
      "/turfs",
      async (req, res) => {
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

          const price = Number(
            data.price
          );

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

          const newTurf = {
            name: String(
              data.name
            ).trim(),

            location: String(
              data.location
            ).trim(),

            description:
              data.description || "",

            price,

            image: data.image || "",

            size: data.size || "",

            surface:
              data.surface || "",

            facilities:
              Array.isArray(
                data.facilities
              )
                ? data.facilities
                : [],

            sport:
              data.sport ||
              "Football",

            rating:
              Number(
                data.rating
              ) || 0,

            ownerEmail:
              normalizeEmail(
                data.ownerEmail
              ),

            ownerId:
              data.ownerId || "",

            status: "pending",

            createdAt:
              new Date(),

            updatedAt:
              new Date(),
          };

          const result =
            await turfsCollection.insertOne(
              newTurf
            );

          res.status(201).send({
            success: true,
            message:
              "Turf submitted successfully",
            turfId:
              result.insertedId,
          });
        } catch (error) {
          console.error(
            "Create turf:",
            error
          );

          res.status(500).send({
            success: false,
            message:
              "Failed to create turf",
          });
        }
      }
    );

    // -------------------------------------------------
    // GET APPROVED TURFS
    // -------------------------------------------------

    app.get(
      "/turfs",
      async (req, res) => {
        try {
          const turfs =
            await turfsCollection
              .find({
                status:
                  "approved",
              })
              .sort({
                createdAt:
                  -1,
              })
              .toArray();

          res.send(turfs);
        } catch (error) {
          console.error(
            "Get turfs:",
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

    // -------------------------------------------------
    // GET TURF BY ID
    // -------------------------------------------------

    app.get(
      "/turfs/:id",
      async (req, res) => {
        try {
          const { id } =
            req.params;

          if (
            !isValidObjectId(id)
          ) {
            return res.status(400).send({
              success: false,
              message:
                "Invalid turf ID",
            });
          }

          const turf =
            await turfsCollection.findOne(
              {
                _id:
                  toObjectId(id),
              }
            );

          if (!turf) {
            return res.status(404).send({
              success: false,
              message:
                "Turf not found",
            });
          }

          res.send(turf);
        } catch (error) {
          console.error(
            "Get turf:",
            error
          );

          res.status(500).send({
            success: false,
            message:
              "Failed to get turf",
          });
        }
      }
    );

    // -------------------------------------------------
    // GET OWNER TURFS
    // -------------------------------------------------

    app.get(
      "/owner/turfs/:email",
      async (req, res) => {
        try {
          const email =
            normalizeEmail(
              req.params.email
            );

          const turfs =
            await turfsCollection
              .find({
                ownerEmail:
                  email,
              })
              .sort({
                createdAt:
                  -1,
              })
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

    // -------------------------------------------------
    // UPDATE TURF
    // -------------------------------------------------

    app.patch(
      "/turfs/:id",
      async (req, res) => {
        try {
          const { id } =
            req.params;

          if (
            !isValidObjectId(id)
          ) {
            return res.status(400).send({
              success: false,
              message:
                "Invalid turf ID",
            });
          }

          const updatedData = {
            ...req.body,
            updatedAt:
              new Date(),
          };

          delete updatedData._id;
          delete updatedData.status;
          delete updatedData.ownerEmail;
          delete updatedData.ownerId;

          if (updatedData.name) {
            updatedData.name =
              String(
                updatedData.name
              ).trim();
          }

          if (
            updatedData.location
          ) {
            updatedData.location =
              String(
                updatedData.location
              ).trim();
          }

          if (
            updatedData.price !==
            undefined
          ) {
            const price =
              Number(
                updatedData.price
              );

            if (
              Number.isNaN(
                price
              ) ||
              price < 0
            ) {
              return res.status(400).send({
                success: false,
                message:
                  "Invalid turf price",
              });
            }

            updatedData.price =
              price;
          }

          if (
            updatedData.facilities !==
              undefined &&
            !Array.isArray(
              updatedData.facilities
            )
          ) {
            updatedData.facilities =
              [];
          }

          const result =
            await turfsCollection.updateOne(
              {
                _id:
                  toObjectId(id),
              },
              {
                $set:
                  updatedData,
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
            await turfsCollection.findOne(
              {
                _id:
                  toObjectId(id),
              }
            );

          res.send({
            success: true,
            message:
              "Turf updated successfully",
            turf,
          });
        } catch (error) {
          console.error(
            "Update turf:",
            error
          );

          res.status(500).send({
            success: false,
            message:
              "Failed to update turf",
          });
        }
      }
    );

    // -------------------------------------------------
    // DELETE TURF
    // -------------------------------------------------

    app.delete(
      "/turfs/:id",
      async (req, res) => {
        try {
          const { id } =
            req.params;

          if (
            !isValidObjectId(id)
          ) {
            return res.status(400).send({
              success: false,
              message:
                "Invalid turf ID",
            });
          }

          const result =
            await turfsCollection.deleteOne(
              {
                _id:
                  toObjectId(id),
              }
            );

          if (!result.deletedCount) {
            return res.status(404).send({
              success: false,
              message:
                "Turf not found",
            });
          }

          // Remove wishlist records
          // belonging to this turf.
          await wishlistCollection.deleteMany(
            {
              turfId: String(id),
            }
          );

          res.send({
            success: true,
            message:
              "Turf deleted successfully",
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

    // =================================================
    // WISHLIST API
    // =================================================

    /*
      Wishlist document:

      {
        _id: ObjectId,
        userEmail: "user@gmail.com",
        turfId: "68xxxxxxxxxxxxxxxxxxxxxx",
        createdAt: Date,
        updatedAt: Date
      }

      turfId is ALWAYS stored as STRING.
    */

    // -------------------------------------------------
    // TOGGLE WISHLIST
    // -------------------------------------------------

    app.post(
      "/wishlist/toggle",
      async (req, res) => {
        try {
          const {
            userEmail,
            email,
            turfId,
          } = req.body;

          const normalizedEmail =
            normalizeEmail(
              userEmail || email
            );

          const normalizedTurfId =
            normalizeTurfId(
              turfId
            );

          // Email validation
          if (!normalizedEmail) {
            return res.status(400).send({
              success: false,
              message:
                "User email is required",
            });
          }

          // Turf ID validation
          if (!normalizedTurfId) {
            return res.status(400).send({
              success: false,
              message:
                "Turf ID is required",
            });
          }

          if (
            !isValidObjectId(
              normalizedTurfId
            )
          ) {
            return res.status(400).send({
              success: false,
              message:
                "Invalid turf ID",
            });
          }

          // ------------------------------------------------
          // CHECK USER
          // ------------------------------------------------

          const user =
            await usersCollection.findOne({
              email:
                normalizedEmail,
            });

          if (!user) {
            return res.status(404).send({
              success: false,
              message:
                "User not found",
            });
          }

          // ------------------------------------------------
          // CHECK TURF
          // ------------------------------------------------

          const turf =
            await turfsCollection.findOne(
              {
                _id:
                  toObjectId(
                    normalizedTurfId
                  ),

                status:
                  "approved",
              }
            );

          if (!turf) {
            return res.status(404).send({
              success: false,
              message:
                "Approved turf not found",
            });
          }

          // ------------------------------------------------
          // CHECK EXISTING WISHLIST
          // ------------------------------------------------

          const existingWishlist =
            await wishlistCollection.findOne(
              {
                userEmail:
                  normalizedEmail,

                turfId:
                  normalizedTurfId,
              }
            );

          // =================================================
          // REMOVE
          // =================================================

          if (existingWishlist) {
            await wishlistCollection.deleteOne(
              {
                _id:
                  existingWishlist._id,
              }
            );

            const count =
              await wishlistCollection.countDocuments(
                {
                  userEmail:
                    normalizedEmail,
                }
              );

            return res.send({
              success: true,

              wishlisted:
                false,

              count,

              message:
                "Turf removed from wishlist",
            });
          }

          // =================================================
          // ADD
          // =================================================

          const now =
            new Date();

          const wishlistItem = {
            userEmail:
              normalizedEmail,

            turfId:
              normalizedTurfId,

            createdAt:
              now,

            updatedAt:
              now,
          };

          try {
            await wishlistCollection.insertOne(
              wishlistItem
            );

            const count =
              await wishlistCollection.countDocuments(
                {
                  userEmail:
                    normalizedEmail,
                }
              );

            return res.status(201).send({
              success: true,

              wishlisted:
                true,

              count,

              message:
                "Turf added to wishlist",
            });
          } catch (insertError) {
            // ------------------------------------------------
            // DUPLICATE REQUEST
            // ------------------------------------------------

            if (
              insertError?.code ===
              11000
            ) {
              const count =
                await wishlistCollection.countDocuments(
                  {
                    userEmail:
                      normalizedEmail,
                  }
                );

              return res.send({
                success: true,

                wishlisted:
                  true,

                count,

                message:
                  "Turf is already in wishlist",
              });
            }

            throw insertError;
          }
        } catch (error) {
          console.error(
            "Toggle wishlist error:",
            error
          );

          return res.status(500).send({
            success: false,
            wishlisted: false,
            message:
              "Failed to update wishlist",

            error:
              process.env.NODE_ENV ===
              "development"
                ? error.message
                : undefined,
          });
        }
      }
    );

    // -------------------------------------------------
    // CHECK WISHLIST STATUS
    // -------------------------------------------------

    app.get(
      "/wishlist/:email/:turfId",
      async (req, res) => {
        try {
          const email =
            normalizeEmail(
              req.params.email
            );

          const turfId =
            normalizeTurfId(
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

          if (
            !isValidObjectId(
              turfId
            )
          ) {
            return res.status(400).send({
              success: false,
              message:
                "Invalid turf ID",
            });
          }

          const wishlistItem =
            await wishlistCollection.findOne(
              {
                userEmail:
                  email,

                turfId,
              }
            );

          return res.send({
            success: true,

            wishlisted:
              Boolean(
                wishlistItem
              ),
          });
        } catch (error) {
          console.error(
            "Check wishlist error:",
            error
          );

          return res.status(500).send({
            success: false,
            message:
              "Failed to check wishlist status",
          });
        }
      }
    );

    // -------------------------------------------------
    // GET WISHLIST COUNT
    // -------------------------------------------------

    app.get(
      "/wishlist/:email/count",
      async (req, res) => {
        try {
          const email =
            normalizeEmail(
              req.params.email
            );

          if (!email) {
            return res.status(400).send({
              success: false,
              message:
                "User email is required",
            });
          }

          const count =
            await wishlistCollection.countDocuments(
              {
                userEmail:
                  email,
              }
            );

          return res.send({
            success: true,
            count,
          });
        } catch (error) {
          console.error(
            "Get wishlist count error:",
            error
          );

          return res.status(500).send({
            success: false,
            message:
              "Failed to get wishlist count",
          });
        }
      }
    );

    // -------------------------------------------------
    // GET USER WISHLIST
    // -------------------------------------------------

    app.get(
      "/wishlist/:email",
      async (req, res) => {
        try {
          const email =
            normalizeEmail(
              req.params.email
            );

          if (!email) {
            return res.status(400).send({
              success: false,
              message:
                "User email is required",
            });
          }

          const wishlistItems =
            await wishlistCollection
              .find({
                userEmail:
                  email,
              })
              .sort({
                createdAt:
                  -1,
              })
              .toArray();

          if (
            !wishlistItems.length
          ) {
            return res.send([]);
          }

          const turfIds =
            wishlistItems
              .map((item) =>
                normalizeTurfId(
                  item.turfId
                )
              )
              .filter((id) =>
                isValidObjectId(
                  id
                )
              )
              .map((id) =>
                toObjectId(id)
              );

          if (!turfIds.length) {
            return res.send([]);
          }

          const turfs =
            await turfsCollection
              .find({
                _id: {
                  $in: turfIds,
                },

                status:
                  "approved",
              })
              .toArray();

          const turfMap =
            new Map();

          turfs.forEach(
            (turf) => {
              turfMap.set(
                String(
                  turf._id
                ),
                turf
              );
            }
          );

          const result =
            wishlistItems
              .map((item) => {
                const turf =
                  turfMap.get(
                    normalizeTurfId(
                      item.turfId
                    )
                  );

                if (!turf) {
                  return null;
                }

                return {
                  wishlistId:
                    String(
                      item._id
                    ),

                  turfId:
                    String(
                      turf._id
                    ),

                  name:
                    turf.name ||
                    "",

                  image:
                    turf.image ||
                    "",

                  location:
                    turf.location ||
                    "",

                  description:
                    turf.description ||
                    "",

                  price:
                    Number(
                      turf.price
                    ) || 0,

                  surface:
                    turf.surface ||
                    "",

                  size:
                    turf.size ||
                    "",

                  facilities:
                    Array.isArray(
                      turf.facilities
                    )
                      ? turf.facilities
                      : [],

                  sport:
                    turf.sport ||
                    "Football",

                  rating:
                    Number(
                      turf.rating
                    ) || 0,

                  ownerEmail:
                    turf.ownerEmail ||
                    "",

                  status:
                    turf.status,

                  wishlistedAt:
                    item.createdAt,
                };
              })
              .filter(Boolean);

          return res.send(result);
        } catch (error) {
          console.error(
            "Get wishlist error:",
            error
          );

          return res.status(500).send({
            success: false,
            message:
              "Failed to get wishlist",
          });
        }
      }
    );

    // -------------------------------------------------
    // REMOVE FROM WISHLIST
    // -------------------------------------------------

    app.delete(
      "/wishlist/:email/:turfId",
      async (req, res) => {
        try {
          const email =
            normalizeEmail(
              req.params.email
            );

          const turfId =
            normalizeTurfId(
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

          if (
            !isValidObjectId(
              turfId
            )
          ) {
            return res.status(400).send({
              success: false,
              message:
                "Invalid turf ID",
            });
          }

          const result =
            await wishlistCollection.deleteOne(
              {
                userEmail:
                  email,

                turfId,
              }
            );

          if (
            !result.deletedCount
          ) {
            return res.status(404).send({
              success: false,
              wishlisted: false,
              message:
                "Turf was not found in your wishlist",
            });
          }

          const count =
            await wishlistCollection.countDocuments(
              {
                userEmail:
                  email,
              }
            );

          return res.send({
            success: true,

            wishlisted:
              false,

            count,

            message:
              "Turf removed from wishlist",
          });
        } catch (error) {
          console.error(
            "Remove wishlist error:",
            error
          );

          return res.status(500).send({
            success: false,
            message:
              "Failed to remove turf from wishlist",
          });
        }
      }
    );

    // =================================================
    // BOOKINGS API
    // =================================================

    // -------------------------------------------------
    // GET BOOKING AVAILABILITY
    // -------------------------------------------------

    app.get(
      "/bookings/availability",
      async (req, res) => {
        try {
          const {
            turfId,
            date,
          } = req.query;

          if (
            !turfId ||
            !date
          ) {
            return res.status(400).send({
              success: false,
              message:
                "Turf ID and date are required",
            });
          }

          if (
            !isValidObjectId(
              turfId
            )
          ) {
            return res.status(400).send({
              success: false,
              message:
                "Invalid turf ID",
            });
          }

          const bookings =
            await bookingsCollection
              .find({
                turfId:
                  String(
                    turfId
                  ),

                date:
                  String(date),

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
            bookings
          );
        } catch (error) {
          console.error(
            "Booking availability:",
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

    // -------------------------------------------------
    // CREATE BOOKING
    // -------------------------------------------------

    app.post(
      "/bookings",
      async (req, res) => {
        try {
          const {
            turfId,
            userEmail,
            date,
            startTime,
            endTime,
            turfName,
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

          if (
            !isValidObjectId(
              turfId
            )
          ) {
            return res.status(400).send({
              success: false,
              message:
                "Invalid turf ID",
            });
          }

          if (
            startTime >= endTime
          ) {
            return res.status(400).send({
              success: false,
              message:
                "End time must be after start time",
            });
          }

          const email =
            normalizeEmail(
              userEmail
            );

          // ------------------------------------------------
          // CHECK USER
          // ------------------------------------------------

          const user =
            await usersCollection.findOne(
              {
                email,
              }
            );

          if (!user) {
            return res.status(404).send({
              success: false,
              message:
                "User not found",
            });
          }

          // ------------------------------------------------
          // CHECK TURF
          // ------------------------------------------------

          const turf =
            await turfsCollection.findOne(
              {
                _id:
                  toObjectId(
                    turfId
                  ),

                status:
                  "approved",
              }
            );

          if (!turf) {
            return res.status(404).send({
              success: false,
              message:
                "Approved turf not found",
            });
          }

          // ------------------------------------------------
          // CHECK OVERLAPPING BOOKING
          // ------------------------------------------------

          const conflictingBooking =
            await bookingsCollection.findOne(
              {
                turfId:
                  String(
                    turfId
                  ),

                date:
                  String(date),

                status: {
                  $in: [
                    "pending",
                    "confirmed",
                  ],
                },

                startTime: {
                  $lt: String(
                    endTime
                  ),
                },

                endTime: {
                  $gt: String(
                    startTime
                  ),
                },
              }
            );

          if (
            conflictingBooking
          ) {
            return res.status(409).send({
              success: false,
              message:
                "This time slot is already booked",
            });
          }

          // ------------------------------------------------
          // CREATE BOOKING
          // ------------------------------------------------

          const newBooking = {
            turfId:
              String(
                turfId
              ),

            turfName:
              turfName ||
              turf.name ||
              "",

            userEmail:
              email,

            date:
              String(date),

            startTime:
              String(
                startTime
              ),

            endTime:
              String(
                endTime
              ),

            status:
              "pending",

            paymentStatus:
              "unpaid",

            createdAt:
              new Date(),

            updatedAt:
              new Date(),
          };

          const result =
            await bookingsCollection.insertOne(
              newBooking
            );

          const booking =
            await bookingsCollection.findOne(
              {
                _id:
                  result.insertedId,
              }
            );

          res.status(201).send({
            success: true,
            message:
              "Booking created successfully",
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

    // -------------------------------------------------
    // GET USER BOOKINGS
    // -------------------------------------------------

    app.get(
      "/bookings/user/:email",
      async (req, res) => {
        try {
          const email =
            normalizeEmail(
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
                userEmail:
                  email,
              })
              .sort({
                createdAt:
                  -1,
              })
              .toArray();

          res.send(
            bookings
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

    // =================================================
    // 404 ROUTE
    // =================================================

    app.use(
      (req, res) => {
        res.status(404).send({
          success: false,
          message: `Route not found: ${req.method} ${req.originalUrl}`,
        });
      }
    );

    console.log(
      "All API routes initialized successfully"
    );
  } catch (error) {
    console.error(
      "MongoDB connection error:",
      error
    );

    process.exit(1);
  }
}

// =====================================================
// START SERVER
// =====================================================

run().catch((error) => {
  console.error(
    "Server startup error:",
    error
  );

  process.exit(1);
});

app.listen(
  port,
  () => {
    console.log(
      `Server running on port ${port}`
    );
  }
);