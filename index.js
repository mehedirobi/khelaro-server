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
// MIDDLEWARE
// =========================

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(express.json({ limit: "2mb" }));

// =========================
// CLOUDINARY
// =========================

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
      cb(
        new Error(
          "Only JPG, PNG and WEBP images are allowed"
        )
      );
    }
  },
});

// =========================
// HELPERS
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

const normalizeId = (id = "") => {
  try {
    return decodeURIComponent(String(id || "")).trim();
  } catch {
    return String(id || "").trim();
  }
};

const normalizeSlug = (slug = "") => {
  try {
    return decodeURIComponent(String(slug || ""))
      .trim()
      .toLowerCase();
  } catch {
    return String(slug || "").trim().toLowerCase();
  }
};

const toNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const isValidObjectId = (id) => {
  return ObjectId.isValid(String(id));
};

const validateDate = (date) => {
  const value = String(date || "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value
    .split("-")
    .map(Number);

  const parsed = new Date(year, month - 1, day);

  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
};

const validateTime = (time) => {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(
    String(time || "")
  );
};

const cleanArray = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
};

// =========================
// RESPONSE NORMALIZERS
// =========================

const normalizeUserResponse = (user) => {
  if (!user) return null;

  return {
    ...user,
    _id: user._id ? String(user._id) : "",
  };
};

const normalizeTurfResponse = (turf) => {
  if (!turf) return null;

  const mongoId = turf._id
    ? String(turf._id)
    : "";

  const customId = String(
    turf.id ||
      turf.turfId ||
      turf.turf_id ||
      ""
  ).trim();

  const stableId = customId || mongoId;

  return {
    ...turf,

    _id: mongoId,

    id: stableId,

    turfId: stableId,

    slug: String(
      turf.slug || ""
    ).trim(),

    name: String(
      turf.name || ""
    ).trim(),

    location: String(
      turf.location || ""
    ).trim(),

    area: String(
      turf.area || ""
    ).trim(),

    sport: String(
      turf.sport || ""
    ).trim(),

    image: String(
      turf.image || ""
    ).trim(),

    price: toNumber(turf.price),

    rating:
      turf.rating !== undefined &&
      turf.rating !== null &&
      turf.rating !== ""
        ? toNumber(turf.rating)
        : null,

    reviews: toNumber(turf.reviews),

    size: String(
      turf.size || ""
    ).trim(),

    surface: String(
      turf.surface || ""
    ).trim(),

    openingTime: String(
      turf.openingTime || "8:00 AM"
    ).trim(),

    closingTime: String(
      turf.closingTime || "11:00 PM"
    ).trim(),

    description: String(
      turf.description || ""
    ).trim(),

    amenities: cleanArray(
      turf.amenities
    ),

    features: cleanArray(
      turf.features
    ),

    status: String(
      turf.status || ""
    ).trim(),

    available:
      turf.available !== undefined
        ? Boolean(turf.available)
        : true,

    ownerEmail: normalizeEmail(
      turf.ownerEmail
    ),
  };
};

const normalizeBookingResponse = (booking) => {
  if (!booking) return null;

  const id = booking._id
    ? String(booking._id)
    : String(
        booking.id ||
          booking.bookingId ||
          ""
      );

  return {
    ...booking,
    _id: id,
    id,
    bookingId: id,
    turfId: String(
      booking.turfId || ""
    ),
    price: toNumber(
      booking.price
    ),
  };
};

const normalizeWishlistResponse = (item) => {
  if (!item) return null;

  const id = item._id
    ? String(item._id)
    : String(
        item.id ||
          item.wishlistId ||
          ""
      );

  return {
    ...item,
    _id: id,
    id,
    wishlistId: id,
    turfId: String(
      item.turfId || ""
    ),
    turfPrice: toNumber(
      item.turfPrice
    ),
  };
};

// =========================
// CLOUDINARY UPLOAD
// =========================

const uploadToCloudinary = (
  buffer,
  options = {}
) => {
  return new Promise((resolve, reject) => {
    const stream =
      cloudinary.uploader.upload_stream(
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
};

// =========================
// TURF FIND HELPERS
// =========================

const findTurfById = async (turfId) => {
  const normalizedId = normalizeId(
    turfId
  );

  if (!normalizedId) {
    return null;
  }

  let turf = null;

  // 1. MongoDB ObjectId
  if (isValidObjectId(normalizedId)) {
    turf =
      await turfsCollection.findOne({
        _id: new ObjectId(normalizedId),
      });
  }

  // 2. Custom id
  if (!turf) {
    turf =
      await turfsCollection.findOne({
        id: normalizedId,
      });
  }

  // 3. turfId
  if (!turf) {
    turf =
      await turfsCollection.findOne({
        turfId: normalizedId,
      });
  }

  // 4. turf_id
  if (!turf) {
    turf =
      await turfsCollection.findOne({
        turf_id: normalizedId,
      });
  }

  // 5. slug
  if (!turf) {
    turf =
      await turfsCollection.findOne({
        slug: normalizeSlug(
          normalizedId
        ),
      });
  }

  return turf;
};

const findTurfBySlug = async (slug) => {
  const normalizedSlug =
    normalizeSlug(slug);

  if (!normalizedSlug) {
    return null;
  }

  return turfsCollection.findOne({
    slug: normalizedSlug,
  });
};

// =========================
// DATABASE
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

let usersCollection;
let turfsCollection;
let bookingsCollection;
let wishlistCollection;

// =========================
// BASIC ROUTES
// =========================

app.get("/", (req, res) => {
  res.send(
    "Khelaro Server is Running"
  );
});

app.get("/health", (req, res) => {
  res.send({
    success: true,
    message: "Khelaro API is healthy",
  });
});

// =========================
// ROUTES
// =========================

function registerRoutes() {
  // =========================
  // USERS
  // =========================

  app.post("/users", async (req, res) => {
    try {
      const data = req.body || {};
      const email = normalizeEmail(
        data.email
      );

      if (!email) {
        return res.status(400).send({
          success: false,
          message: "Email is required",
        });
      }

      const existingUser =
        await usersCollection.findOne({
          email,
        });

      if (existingUser) {
        return res.send({
          success: true,
          message: "User already exists",
          user:
            normalizeUserResponse(
              existingUser
            ),
        });
      }

      const allowedRoles = [
        "user",
        "owner",
        "admin",
      ];

      const role =
        allowedRoles.includes(
          data.role
        )
          ? data.role
          : "user";

      const now = new Date();

      const newUser = {
        uid: String(
          data.uid || ""
        ).trim(),

        name: String(
          data.name || ""
        ).trim(),

        email,

        phone: String(
          data.phone || ""
        ).trim(),

        location: String(
          data.location || ""
        ).trim(),

        photoURL: String(
          data.photoURL || ""
        ).trim(),

        role,

        createdAt: now,
        updatedAt: now,
      };

      const result =
        await usersCollection.insertOne(
          newUser
        );

      const user =
        await usersCollection.findOne({
          _id: result.insertedId,
        });

      res.status(201).send({
        success: true,
        message:
          "User created successfully",
        user:
          normalizeUserResponse(
            user
          ),
      });
    } catch (error) {
      console.error(
        "Create user:",
        error
      );

      if (error?.code === 11000) {
        return res.status(409).send({
          success: false,
          message:
            "User already exists",
        });
      }

      res.status(500).send({
        success: false,
        message:
          "Failed to create user",
      });
    }
  });

  app.get("/users", async (req, res) => {
    try {
      const users =
        await usersCollection
          .find({})
          .sort({
            createdAt: -1,
          })
          .toArray();

      res.send({
        success: true,
        users: users.map(
          normalizeUserResponse
        ),
      });
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

  app.get(
    "/users/:email",
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
              "Email is required",
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

        res.send({
          success: true,
          user:
            normalizeUserResponse(
              user
            ),
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

  app.patch(
    "/users/:email",
    async (req, res) => {
      try {
        const email =
          normalizeEmail(
            req.params.email
          );

        const {
          name,
          phone,
          location,
          photoURL,
        } = req.body || {};

        if (!email) {
          return res.status(400).send({
            success: false,
            message:
              "Email is required",
          });
        }

        if (!String(name || "").trim()) {
          return res.status(400).send({
            success: false,
            message:
              "Name is required",
          });
        }

        const updateData = {
          name: String(name).trim(),

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
            String(
              photoURL
            ).trim();
        }

        const result =
          await usersCollection.updateOne(
            { email },
            {
              $set: updateData,
            }
          );

        if (!result.matchedCount) {
          return res.status(404).send({
            success: false,
            message:
              "User not found",
          });
        }

        const user =
          await usersCollection.findOne({
            email,
          });

        res.send({
          success: true,
          message:
            "Profile updated successfully",
          user:
            normalizeUserResponse(
              user
            ),
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

        const publicId =
          `user-${email.replace(
            /[^a-zA-Z0-9]/g,
            "_"
          )}`;

        const result =
          await uploadToCloudinary(
            req.file.buffer,
            {
              folder:
                "khelaro/profile-photos",
              public_id: publicId,
              overwrite: true,
            }
          );

        await usersCollection.updateOne(
          { email },
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
          user:
            normalizeUserResponse(
              updatedUser
            ),
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

  app.patch(
    "/users/:email/role",
    async (req, res) => {
      try {
        const email =
          normalizeEmail(
            req.params.email
          );

        const role = String(
          req.body?.role || ""
        ).trim();

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
            { email },
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

        const user =
          await usersCollection.findOne({
            email,
          });

        res.send({
          success: true,
          message:
            `User role updated to ${role}`,
          user:
            normalizeUserResponse(
              user
            ),
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

  // =========================
  // TURFS
  // =========================

  app.get(
    "/turfs",
    async (req, res) => {
      try {
        const {
          search = "",
          area = "",
          sport = "",
          minPrice,
          maxPrice,
          sort = "newest",
        } = req.query;

        const query = {
          $or: [
            { status: "approved" },
            {
              status: {
                $exists: false,
              },
            },
            { status: "" },
          ],
        };

        const searchText =
          String(search).trim();

        const areaText =
          String(area).trim();

        const sportText =
          String(sport).trim();

        if (searchText) {
          query.$and = [
            {
              $or: [
                {
                  name: {
                    $regex:
                      searchText,
                    $options:
                      "i",
                  },
                },
                {
                  location: {
                    $regex:
                      searchText,
                    $options:
                      "i",
                  },
                },
                {
                  area: {
                    $regex:
                      searchText,
                    $options:
                      "i",
                  },
                },
                {
                  sport: {
                    $regex:
                      searchText,
                    $options:
                      "i",
                  },
                },
              ],
            },
          ];
        }

        if (areaText) {
          query.area = {
            $regex: areaText,
            $options: "i",
          };
        }

        if (sportText) {
          query.sport = {
            $regex: sportText,
            $options: "i",
          };
        }

        const min = Number(
          minPrice
        );

        const max = Number(
          maxPrice
        );

        if (
          Number.isFinite(min) ||
          Number.isFinite(max)
        ) {
          query.price = {};

          if (
            Number.isFinite(min)
          ) {
            query.price.$gte =
              min;
          }

          if (
            Number.isFinite(max)
          ) {
            query.price.$lte =
              max;
          }
        }

        let sortOption = {
          createdAt: -1,
        };

        if (
          sort === "price-low"
        ) {
          sortOption = {
            price: 1,
          };
        }

        if (
          sort === "price-high"
        ) {
          sortOption = {
            price: -1,
          };
        }

        if (sort === "rating") {
          sortOption = {
            rating: -1,
            reviews: -1,
          };
        }

        const turfs =
          await turfsCollection
            .find(query)
            .sort(sortOption)
            .toArray();

        res.send({
          success: true,
          count: turfs.length,
          turfs: turfs.map(
            normalizeTurfResponse
          ),
        });
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

  // IMPORTANT:
  // Keep slug route before /turfs/:id
  app.get(
    "/turfs/slug/:slug",
    async (req, res) => {
      try {
        const slug =
          normalizeSlug(
            req.params.slug
          );

        if (!slug) {
          return res.status(400).send({
            success: false,
            message:
              "Turf slug is required",
          });
        }

        const turf =
          await findTurfBySlug(
            slug
          );

        if (!turf) {
          return res.status(404).send({
            success: false,
            message:
              "Turf not found",
          });
        }

        res.send({
          success: true,
          turf:
            normalizeTurfResponse(
              turf
            ),
        });
      } catch (error) {
        console.error(
          "Get turf by slug:",
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

  // Main turf details route
  app.get(
    "/turfs/:id",
    async (req, res) => {
      try {
        const turfId =
          normalizeId(
            req.params.id
          );

        if (!turfId) {
          return res.status(400).send({
            success: false,
            message:
              "Turf ID is required",
          });
        }

        const turf =
          await findTurfById(
            turfId
          );

        if (!turf) {
          return res.status(404).send({
            success: false,
            message:
              "Turf not found",
          });
        }

        res.send({
          success: true,
          turf:
            normalizeTurfResponse(
              turf
            ),
        });
      } catch (error) {
        console.error(
          "Get turf by ID:",
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

  // Backward-compatible route
  app.get(
    "/turfs/id/:id",
    async (req, res) => {
      try {
        const turfId =
          normalizeId(
            req.params.id
          );

        if (!turfId) {
          return res.status(400).send({
            success: false,
            message:
              "Turf ID is required",
          });
        }

        const turf =
          await findTurfById(
            turfId
          );

        if (!turf) {
          return res.status(404).send({
            success: false,
            message:
              "Turf not found",
          });
        }

        res.send({
          success: true,
          turf:
            normalizeTurfResponse(
              turf
            ),
        });
      } catch (error) {
        console.error(
          "Get turf by ID:",
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

  app.post(
    "/turfs",
    async (req, res) => {
      try {
        const data =
          req.body || {};

        const ownerEmail =
          normalizeEmail(
            data.ownerEmail ||
              data.email
          );

        const name = String(
          data.name || ""
        ).trim();

        const location =
          String(
            data.location || ""
          ).trim();

        const area = String(
          data.area || ""
        ).trim();

        const sport = String(
          data.sport || ""
        ).trim();

        const image = String(
          data.image || ""
        ).trim();

        const price = toNumber(
          data.price
        );

        if (!ownerEmail) {
          return res.status(400).send({
            success: false,
            message:
              "Owner email is required",
          });
        }

        if (!name) {
          return res.status(400).send({
            success: false,
            message:
              "Turf name is required",
          });
        }

        if (!location) {
          return res.status(400).send({
            success: false,
            message:
              "Turf location is required",
          });
        }

        if (!sport) {
          return res.status(400).send({
            success: false,
            message:
              "Sport is required",
          });
        }

        if (price < 0) {
          return res.status(400).send({
            success: false,
            message:
              "Price cannot be negative",
          });
        }

        const owner =
          await usersCollection.findOne({
            email: ownerEmail,
          });

        if (!owner) {
          return res.status(404).send({
            success: false,
            message:
              "Owner account not found",
          });
        }

        const slugBase =
          String(
            data.slug || name
          )
            .toLowerCase()
            .trim()
            .replace(
              /[^a-z0-9]+/g,
              "-"
            )
            .replace(
              /^-+|-+$/g,
              "");

        let slug =
          slugBase ||
          `turf-${Date.now()}`;

        const existingSlug =
          await turfsCollection.findOne({
            slug,
          });

        if (existingSlug) {
          slug = `${slug}-${Date.now()}`;
        }

        const now =
          new Date();

        const newTurf = {
          slug,
          name,
          location,
          area,
          sport,
          price,
          image,

          rating:
            data.rating !==
            undefined
              ? toNumber(
                  data.rating
                )
              : null,

          reviews:
            data.reviews !==
            undefined
              ? toNumber(
                  data.reviews
                )
              : 0,

          size: String(
            data.size || ""
          ).trim(),

          surface: String(
            data.surface || ""
          ).trim(),

          openingTime:
            String(
              data.openingTime ||
                "8:00 AM"
            ).trim(),

          closingTime:
            String(
              data.closingTime ||
                "11:00 PM"
            ).trim(),

          description:
            String(
              data.description ||
                ""
            ).trim(),

          amenities:
            cleanArray(
              data.amenities
            ),

          features:
            cleanArray(
              data.features
            ),

          available:
            data.available !==
            undefined
              ? Boolean(
                  data.available
                )
              : true,

          ownerEmail,

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
            _id:
              result.insertedId,
          });

        res.status(201).send({
          success: true,
          message:
            "Turf submitted for approval",
          turf:
            normalizeTurfResponse(
              turf
            ),
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

  app.get(
    "/owner/turfs/:email",
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
              "Owner email is required",
          });
        }

        const turfs =
          await turfsCollection
            .find({
              ownerEmail: email,
            })
            .sort({
              createdAt: -1,
            })
            .toArray();

        res.send({
          success: true,
          count: turfs.length,
          turfs: turfs.map(
            normalizeTurfResponse
          ),
        });
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

        res.send({
          success: true,
          count: turfs.length,
          turfs: turfs.map(
            normalizeTurfResponse
          ),
        });
      } catch (error) {
        console.error(
          "Get admin turfs:",
          error
        );

        res.status(500).send({
          success: false,
          message:
            "Failed to get admin turfs",
        });
      }
    }
  );

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

        res.send({
          success: true,
          count: turfs.length,
          turfs: turfs.map(
            normalizeTurfResponse
          ),
        });
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

  app.patch(
    "/admin/turfs/:id/status",
    async (req, res) => {
      try {
        const turfId =
          normalizeId(
            req.params.id
          );

        const status =
          String(
            req.body?.status || ""
          ).trim();

        if (!isValidObjectId(turfId)) {
          return res.status(400).send({
            success: false,
            message:
              "Invalid turf ID",
          });
        }

        if (
          ![
            "pending",
            "approved",
            "rejected",
          ].includes(status)
        ) {
          return res.status(400).send({
            success: false,
            message:
              "Invalid turf status",
          });
        }

        const result =
          await turfsCollection.updateOne(
            {
              _id: new ObjectId(
                turfId
              ),
            },
            {
              $set: {
                status,
                updatedAt:
                  new Date(),
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
            _id: new ObjectId(
              turfId
            ),
          });

        res.send({
          success: true,
          message:
            `Turf ${status} successfully`,
          turf:
            normalizeTurfResponse(
              turf
            ),
        });
      } catch (error) {
        console.error(
          "Update turf status:",
          error
        );

        res.status(500).send({
          success: false,
          message:
            "Failed to update turf status",
        });
      }
    }
  );

  app.delete(
    "/admin/turfs/:id",
    async (req, res) => {
      try {
        const turfId =
          normalizeId(
            req.params.id
          );

        if (!isValidObjectId(turfId)) {
          return res.status(400).send({
            success: false,
            message:
              "Invalid turf ID",
          });
        }

        const result =
          await turfsCollection.deleteOne({
            _id: new ObjectId(
              turfId
            ),
          });

        if (!result.deletedCount) {
          return res.status(404).send({
            success: false,
            message:
              "Turf not found",
          });
        }

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

  // =========================
  // BOOKINGS
  // =========================

  app.get(
    "/bookings/availability",
    async (req, res) => {
      try {
        const turfId =
          normalizeId(
            req.query.turfId
          );

        const date =
          String(
            req.query.date || ""
          ).trim();

        if (!turfId) {
          return res.status(400).send({
            success: false,
            message:
              "Turf ID is required",
          });
        }

        if (!validateDate(date)) {
          return res.status(400).send({
            success: false,
            message:
              "Valid date is required",
          });
        }

        const turf =
          await findTurfById(
            turfId
          );

        if (!turf) {
          return res.status(404).send({
            success: false,
            message:
              "Turf not found",
          });
        }

        const actualTurfId =
          turf._id
            ? String(turf._id)
            : String(
                turf.id ||
                  turf.turfId ||
                  turf.turf_id ||
                  ""
              );

        const bookings =
          await bookingsCollection
            .find({
              turfId:
                actualTurfId,
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

        res.send({
          success: true,
          date,
          turfId:
            actualTurfId,
          bookings:
            bookings.map(
              normalizeBookingResponse
            ),
        });
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

  app.post(
    "/bookings",
    async (req, res) => {
      try {
        const data =
          req.body || {};

        const turfId =
          normalizeId(
            data.turfId ||
              data.id ||
              data.turf_id
          );

        const userEmail =
          normalizeEmail(
            data.userEmail ||
              data.email
          );

        const date =
          String(
            data.date || ""
          ).trim();

        const startTime =
          String(
            data.startTime || ""
          ).trim();

        const endTime =
          String(
            data.endTime || ""
          ).trim();

        if (!turfId) {
          return res.status(400).send({
            success: false,
            message:
              "Turf ID is required",
          });
        }

        if (!userEmail) {
          return res.status(400).send({
            success: false,
            message:
              "User email is required",
          });
        }

        if (!validateDate(date)) {
          return res.status(400).send({
            success: false,
            message:
              "Valid date is required",
          });
        }

        if (
          !validateTime(
            startTime
          ) ||
          !validateTime(endTime)
        ) {
          return res.status(400).send({
            success: false,
            message:
              "Valid start and end time are required",
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

        const user =
          await usersCollection.findOne({
            email: userEmail,
          });

        if (!user) {
          return res.status(404).send({
            success: false,
            message:
              "User not found",
          });
        }

        const turf =
          await findTurfById(
            turfId
          );

        if (!turf) {
          return res.status(404).send({
            success: false,
            message:
              "Turf not found",
          });
        }

        const actualTurfId =
          turf._id
            ? String(turf._id)
            : String(
                turf.id ||
                  turf.turfId ||
                  turf.turf_id ||
                  ""
              );

        const conflictingBooking =
          await bookingsCollection.findOne({
            turfId:
              actualTurfId,

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

        const now =
          new Date();

        const booking = {
          turfId:
            actualTurfId,

          turfSlug: String(
            turf.slug || ""
          ).trim(),

          turfName: String(
            turf.name || ""
          ).trim(),

          turfLocation:
            String(
              turf.location ||
                turf.area ||
                ""
            ).trim(),

          turfImage: String(
            turf.image || ""
          ).trim(),

          price: toNumber(
            turf.price
          ),

          ownerEmail:
            normalizeEmail(
              turf.ownerEmail
            ),

          userEmail,

          userName:
            String(
              data.userName ||
                user.name ||
                ""
            ).trim(),

          userPhone:
            String(
              data.userPhone ||
                user.phone ||
                ""
            ).trim(),

          date,
          startTime,
          endTime,

          paymentStatus:
            "unpaid",

          paymentMethod:
            String(
              data.paymentMethod ||
                ""
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
            _id:
              result.insertedId,
          });

        res.status(201).send({
          success: true,
          message:
            "Booking created successfully",
          booking:
            normalizeBookingResponse(
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
    }
  );

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
              userEmail: email,
            })
            .sort({
              date: -1,
              startTime: -1,
            })
            .toArray();

        res.send({
          success: true,
          count: bookings.length,
          bookings:
            bookings.map(
              normalizeBookingResponse
            ),
        });
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
        const bookingId =
          normalizeId(
            req.params.id
          );

        if (
          !isValidObjectId(
            bookingId
          )
        ) {
          return res.status(400).send({
            success: false,
            message:
              "Invalid booking ID",
          });
        }

        const booking =
          await bookingsCollection.findOne({
            _id: new ObjectId(
              bookingId
            ),
          });

        if (!booking) {
          return res.status(404).send({
            success: false,
            message:
              "Booking not found",
          });
        }

        res.send({
          success: true,
          booking:
            normalizeBookingResponse(
              booking
            ),
        });
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
        const bookingId =
          normalizeId(
            req.params.id
          );

        if (
          !isValidObjectId(
            bookingId
          )
        ) {
          return res.status(400).send({
            success: false,
            message:
              "Invalid booking ID",
          });
        }

        const booking =
          await bookingsCollection.findOne({
            _id: new ObjectId(
              bookingId
            ),
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
            _id: new ObjectId(
              bookingId
            ),
          },
          {
            $set: {
              status:
                "cancelled",
              updatedAt:
                new Date(),
            },
          }
        );

        const updatedBooking =
          await bookingsCollection.findOne({
            _id: new ObjectId(
              bookingId
            ),
          });

        res.send({
          success: true,
          message:
            "Booking cancelled successfully",
          booking:
            normalizeBookingResponse(
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

  app.get(
    "/owner/bookings/:email",
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
              "Owner email is required",
          });
        }

        const bookings =
          await bookingsCollection
            .find({
              ownerEmail: email,
            })
            .sort({
              date: -1,
              startTime: -1,
            })
            .toArray();

        res.send({
          success: true,
          count: bookings.length,
          bookings:
            bookings.map(
              normalizeBookingResponse
            ),
        });
      } catch (error) {
        console.error(
          "Get owner bookings:",
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

  app.patch(
    "/owner/bookings/:id/status",
    async (req, res) => {
      try {
        const bookingId =
          normalizeId(
            req.params.id
          );

        const status =
          String(
            req.body?.status || ""
          ).trim();

        const allowedStatuses = [
          "pending",
          "confirmed",
          "cancelled",
          "completed",
        ];

        if (
          !isValidObjectId(
            bookingId
          )
        ) {
          return res.status(400).send({
            success: false,
            message:
              "Invalid booking ID",
          });
        }

        if (
          !allowedStatuses.includes(
            status
          )
        ) {
          return res.status(400).send({
            success: false,
            message:
              "Invalid booking status",
          });
        }

        const result =
          await bookingsCollection.updateOne(
            {
              _id: new ObjectId(
                bookingId
              ),
            },
            {
              $set: {
                status,
                updatedAt:
                  new Date(),
              },
            }
          );

        if (!result.matchedCount) {
          return res.status(404).send({
            success: false,
            message:
              "Booking not found",
          });
        }

        const booking =
          await bookingsCollection.findOne({
            _id: new ObjectId(
              bookingId
            ),
          });

        res.send({
          success: true,
          message:
            "Booking status updated successfully",
          booking:
            normalizeBookingResponse(
              booking
            ),
        });
      } catch (error) {
        console.error(
          "Update booking status:",
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

  // =========================
  // WISHLIST
  // =========================

  app.get(
    "/wishlist/:email/:turfId",
    async (req, res) => {
      try {
        const email =
          normalizeEmail(
            req.params.email
          );

        const turfId =
          normalizeId(
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

        const turf =
          await findTurfById(
            turfId
          );

        if (!turf) {
          return res.status(404).send({
            success: false,
            message:
              "Turf not found",
          });
        }

        const actualTurfId =
          turf._id
            ? String(turf._id)
            : String(
                turf.id ||
                  turf.turfId ||
                  turf.turf_id ||
                  ""
              );

        const wishlist =
          await wishlistCollection.findOne({
            userEmail: email,
            turfId:
              actualTurfId,
          });

        res.send({
          success: true,
          wishlisted:
            Boolean(
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
        const data =
          req.body || {};

        const userEmail =
          normalizeEmail(
            data.userEmail ||
              data.email
          );

        const turfId =
          normalizeId(
            data.turfId ||
              data.id ||
              data.turf_id
          );

        if (!userEmail) {
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

        const user =
          await usersCollection.findOne({
            email:
              userEmail,
          });

        if (!user) {
          return res.status(404).send({
            success: false,
            message:
              "User not found",
          });
        }

        const turf =
          await findTurfById(
            turfId
          );

        if (!turf) {
          return res.status(404).send({
            success: false,
            message:
              "Turf not found",
          });
        }

        const actualTurfId =
          turf._id
            ? String(turf._id)
            : String(
                turf.id ||
                  turf.turfId ||
                  turf.turf_id ||
                  ""
              );

        const existing =
          await wishlistCollection.findOne({
            userEmail,
            turfId:
              actualTurfId,
          });

        if (existing) {
          await wishlistCollection.deleteOne({
            _id:
              existing._id,
          });

          const count =
            await wishlistCollection.countDocuments({
              userEmail,
            });

          return res.send({
            success: true,
            wishlisted: false,
            count,
            message:
              "Turf removed from wishlist",
          });
        }

        const now =
          new Date();

        await wishlistCollection.insertOne({
          userEmail,

          turfId:
            actualTurfId,

          turfSlug:
            String(
              turf.slug || ""
            ).trim(),

          turfName:
            String(
              turf.name || ""
            ).trim(),

          turfLocation:
            String(
              turf.location ||
                turf.area ||
                ""
            ).trim(),

          turfImage:
            String(
              turf.image || ""
            ).trim(),

          turfPrice:
            toNumber(
              turf.price
            ),

          createdAt: now,
          updatedAt: now,
        });

        const count =
          await wishlistCollection.countDocuments({
            userEmail,
          });

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

        if (
          error?.code === 11000
        ) {
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

        const wishlist =
          await wishlistCollection
            .find({
              userEmail:
                email,
            })
            .sort({
              createdAt: -1,
            })
            .toArray();

        res.send({
          success: true,
          count:
            wishlist.length,
          wishlist:
            wishlist.map(
              normalizeWishlistResponse
            ),
        });
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
}

// =========================
// DATABASE START
// =========================

async function run() {
  try {
    await client.connect();

    const db =
      client.db("khelaro");

    usersCollection =
      db.collection("users");

    turfsCollection =
      db.collection("turfs");

    bookingsCollection =
      db.collection("bookings");

    wishlistCollection =
      db.collection("wishlist");

    console.log(
      "MongoDB Connected Successfully"
    );

    // =========================
    // INDEXES
    // =========================

    try {
      await usersCollection.createIndex(
        { email: 1 },
        {
          unique: true,
          name:
            "unique_user_email",
        }
      );
    } catch (error) {
      console.error(
        "User index warning:",
        error.message
      );
    }

    try {
      await turfsCollection.createIndex(
        { slug: 1 },
        {
          unique: true,
          sparse: true,
          name:
            "unique_turf_slug",
        }
      );
    } catch (error) {
      console.error(
        "Turf slug index warning:",
        error.message
      );
    }

    try {
      await turfsCollection.createIndex(
        {
          id: 1,
        },
        {
          sparse: true,
          name:
            "turf_custom_id",
        }
      );
    } catch (error) {
      console.error(
        "Turf id index warning:",
        error.message
      );
    }

    try {
      await turfsCollection.createIndex(
        {
          turfId: 1,
        },
        {
          sparse: true,
          name:
            "turf_turfId",
        }
      );
    } catch (error) {
      console.error(
        "Turf turfId index warning:",
        error.message
      );
    }

    try {
      await turfsCollection.createIndex(
        {
          status: 1,
          createdAt: -1,
        },
        {
          name:
            "turf_status_createdAt",
        }
      );
    } catch (error) {
      console.error(
        "Turf status index warning:",
        error.message
      );
    }

    try {
      await turfsCollection.createIndex(
        {
          ownerEmail: 1,
          createdAt: -1,
        },
        {
          name:
            "turf_owner_createdAt",
        }
      );
    } catch (error) {
      console.error(
        "Turf owner index warning:",
        error.message
      );
    }

    try {
      await bookingsCollection.createIndex(
        {
          userEmail: 1,
          date: -1,
        },
        {
          name:
            "bookings_user_date",
        }
      );
    } catch (error) {
      console.error(
        "Booking user index warning:",
        error.message
      );
    }

    try {
      await bookingsCollection.createIndex(
        {
          turfId: 1,
          date: 1,
          startTime: 1,
        },
        {
          name:
            "bookings_turf_date_time",
        }
      );
    } catch (error) {
      console.error(
        "Booking turf index warning:",
        error.message
      );
    }

    try {
      await wishlistCollection.createIndex(
        {
          userEmail: 1,
          createdAt: -1,
        },
        {
          name:
            "wishlist_user_createdAt",
        }
      );
    } catch (error) {
      console.error(
        "Wishlist user index warning:",
        error.message
      );
    }

    try {
      await wishlistCollection.createIndex(
        {
          userEmail: 1,
          turfId: 1,
        },
        {
          unique: true,
          name:
            "unique_user_turf_wishlist",
        }
      );
    } catch (error) {
      console.error(
        "Wishlist unique index warning:",
        error.message
      );
    }

    registerRoutes();

    console.log(
      "Turf source: MongoDB / turfs collection"
    );

    // =========================
    // 404 HANDLER
    // =========================

    app.use((req, res) => {
      res.status(404).send({
        success: false,
        message:
          "API route not found",
        path:
          req.originalUrl,
      });
    });

    // =========================
    // ERROR HANDLER
    // =========================

    app.use(
      (
        error,
        req,
        res,
        next
      ) => {
        console.error(
          "Unhandled error:",
          error
        );

        if (
          error instanceof
          multer.MulterError
        ) {
          return res.status(400).send({
            success: false,
            message:
              error.message,
          });
        }

        res.status(500).send({
          success: false,
          message:
            error?.message ||
            "Internal server error",
        });
      }
    );

    // =========================
    // SERVER
    // =========================

    app.listen(
      port,
      () => {
        console.log(
          `Khelaro server listening on port ${port}`
        );
      }
    );
  } catch (error) {
    console.error(
      "MongoDB connection error:",
      error
    );

    process.exit(1);
  }
}

// =========================
// START
// =========================

run().catch((error) => {
  console.error(
    "Server startup failed:",
    error
  );

  process.exit(1);
});