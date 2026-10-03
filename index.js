const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const dns = require("node:dns");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

dotenv.config();

// DNS fix for Windows SRV issues
dns.setServers(["1.1.1.1", "8.8.8.8"]);

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Helpers
const normalizeEmail = (email = "") => {
  try {
    return decodeURIComponent(String(email)).trim().toLowerCase();
  } catch {
    return String(email).trim().toLowerCase();
  }
};

const isValidObjectId = (id) => ObjectId.isValid(id);

// MongoDB Setup
const uri = `mongodb+srv://${encodeURIComponent(process.env.DB_USER)}:${encodeURIComponent(process.env.DB_PASS)}@cluster0.yvhjyyn.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Basic Routes
app.get("/", (req, res) => {
  res.send("Khelaro Server is Running");
});

app.get("/health", (req, res) => {
  res.send({ success: true, message: "Khelaro API is healthy" });
});

// Server Logic
async function run() {
  try {
    await client.connect();

    const db = client.db("khelaro");
    const usersCollection = db.collection("users");
    const turfsCollection = db.collection("turfs");
    const bookingsCollection = db.collection("bookings");
    const wishlistCollection = db.collection("wishlist");

    console.log("MongoDB Connected Successfully");

    // --- USERS API ---
    app.post("/users", async (req, res) => {
      try {
        const user = req.body;
        if (!user.email) {
          return res
            .status(400)
            .send({ success: false, message: "Email is required" });
        }

        const email = normalizeEmail(user.email);
        const existingUser = await usersCollection.findOne({ email });

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

        const result = await usersCollection.insertOne(newUser);
        const createdUser = await usersCollection.findOne({
          _id: result.insertedId,
        });

        res.status(201).send({
          success: true,
          message: "User created successfully",
          user: createdUser,
        });
      } catch (error) {
        console.error("Create user error:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to create user" });
      }
    });

    app.get("/users", async (req, res) => {
      try {
        const users = await usersCollection
          .find({})
          .sort({ createdAt: -1 })
          .toArray();
        res.send(users);
      } catch (error) {
        console.error("Get users error:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to get users" });
      }
    });

    app.get("/users/:email", async (req, res) => {
      try {
        const email = normalizeEmail(req.params.email);
        console.log("Looking for user:", email);

        const user = await usersCollection.findOne({ email });
        console.log("Found user:", user);

        if (!user) {
          return res.status(404).send({
            success: false,
            message: "User not found",
            searchedEmail: email,
          });
        }

        res.status(200).send({ success: true, user });
      } catch (error) {
        console.error("Get user by email error:", error);
        res.status(500).send({ success: false, message: "Failed to get user" });
      }
    });

    app.patch("/users/:email", async (req, res) => {
      try {
        const email = normalizeEmail(req.params.email);
        const { name, phone, photoURL } = req.body;

        if (!name || !name.trim()) {
          return res
            .status(400)
            .send({ success: false, message: "Name is required" });
        }

        const updateData = {
          name: name.trim(),
          phone: phone || "",
          updatedAt: new Date(),
        };

        if (photoURL !== undefined) {
          updateData.photoURL = photoURL;
        }

        const result = await usersCollection.updateOne(
          { email },
          { $set: updateData },
        );

        if (result.matchedCount === 0) {
          return res
            .status(404)
            .send({ success: false, message: "User not found" });
        }

        const updatedUser = await usersCollection.findOne({ email });
        res.send({
          success: true,
          message: "Profile updated successfully",
          user: updatedUser,
        });
      } catch (error) {
        console.error("Update profile error:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to update profile" });
      }
    });

    app.patch("/users/:email/role", async (req, res) => {
      try {
        const email = normalizeEmail(req.params.email);
        const { role } = req.body;
        const allowedRoles = ["user", "owner", "admin"];

        if (!allowedRoles.includes(role)) {
          return res
            .status(400)
            .send({ success: false, message: "Invalid role" });
        }

        const result = await usersCollection.updateOne(
          { email },
          { $set: { role, updatedAt: new Date() } },
        );

        if (result.matchedCount === 0) {
          return res
            .status(404)
            .send({ success: false, message: "User not found" });
        }

        const updatedUser = await usersCollection.findOne({ email });
        res.send({
          success: true,
          message: `User role updated to ${role}`,
          user: updatedUser,
        });
      } catch (error) {
        console.error("Update role error:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to update user role" });
      }
    });

    // --- TURF API ---
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
            message: "Required turf information is missing",
          });
        }

        const price = Number(turfData.price);
        if (Number.isNaN(price) || price < 0) {
          return res
            .status(400)
            .send({ success: false, message: "Invalid turf price" });
        }

        const newTurf = {
          name: turfData.name.trim(),
          location: turfData.location.trim(),
          description: turfData.description || "",
          price,
          image: turfData.image || "",
          size: turfData.size || "",
          surface: turfData.surface || "",
          facilities: Array.isArray(turfData.facilities)
            ? turfData.facilities
            : [],
          ownerEmail: normalizeEmail(turfData.ownerEmail),
          ownerId: turfData.ownerId || "",
          status: "pending",
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await turfsCollection.insertOne(newTurf);
        res.status(201).send({
          success: true,
          message: "Turf submitted successfully. Waiting for admin approval.",
          turfId: result.insertedId,
        });
      } catch (error) {
        console.error("Create turf error:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to create turf" });
      }
    });

    app.get("/turfs", async (req, res) => {
      try {
        const result = await turfsCollection
          .find({ status: "approved" })
          .sort({ createdAt: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        console.error("Get turfs error:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to get turfs" });
      }
    });

    app.get("/turfs/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!isValidObjectId(id)) {
          return res
            .status(400)
            .send({ success: false, message: "Invalid turf ID" });
        }

        const turf = await turfsCollection.findOne({ _id: new ObjectId(id) });
        if (!turf) {
          return res
            .status(404)
            .send({ success: false, message: "Turf not found" });
        }

        res.send(turf);
      } catch (error) {
        console.error("Get turf error:", error);
        res.status(500).send({ success: false, message: "Failed to get turf" });
      }
    });

    app.get("/owner/turfs/:email", async (req, res) => {
      try {
        const email = normalizeEmail(req.params.email);
        const result = await turfsCollection
          .find({ ownerEmail: email })
          .sort({ createdAt: -1 })
          .toArray();
        res.send(result);
      } catch (error) {
        console.error("Get owner turfs error:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to get owner turfs" });
      }
    });

    app.patch("/turfs/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!isValidObjectId(id)) {
          return res
            .status(400)
            .send({ success: false, message: "Invalid turf ID" });
        }

        const updatedData = { ...req.body, updatedAt: new Date() };
        delete updatedData._id;
        delete updatedData.status;
        delete updatedData.ownerEmail;
        delete updatedData.ownerId;

        if (updatedData.name) updatedData.name = updatedData.name.trim();
        if (updatedData.location)
          updatedData.location = updatedData.location.trim();

        if (updatedData.price !== undefined) {
          const price = Number(updatedData.price);
          if (Number.isNaN(price) || price < 0) {
            return res
              .status(400)
              .send({ success: false, message: "Invalid turf price" });
          }
          updatedData.price = price;
        }

        const result = await turfsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData },
        );

        if (result.matchedCount === 0) {
          return res
            .status(404)
            .send({ success: false, message: "Turf not found" });
        }

        const updatedTurf = await turfsCollection.findOne({
          _id: new ObjectId(id),
        });
        res.send({
          success: true,
          message: "Turf updated successfully",
          turf: updatedTurf,
        });
      } catch (error) {
        console.error("Update turf error:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to update turf" });
      }
    });

    app.delete("/turfs/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!isValidObjectId(id)) {
          return res
            .status(400)
            .send({ success: false, message: "Invalid turf ID" });
        }

        const result = await turfsCollection.deleteOne({
          _id: new ObjectId(id),
        });
        if (result.deletedCount === 0) {
          return res
            .status(404)
            .send({ success: false, message: "Turf not found" });
        }

        await wishlistCollection.deleteMany({ turfId: id });
        res.send({ success: true, message: "Turf deleted successfully" });
      } catch (error) {
        console.error("Delete turf error:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to delete turf" });
      }
    });

    // --- ADMIN USERS API ---
    app.get("/admin/users", async (req, res) => {
      try {
        const users = await usersCollection
          .find({})
          .sort({ createdAt: -1 })
          .toArray();
        res.send(users);
      } catch (error) {
        console.error("Get admin users error:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to get users" });
      }
    });

    app.get("/admin/customers", async (req, res) => {
      try {
        const customers = await usersCollection
          .find({ role: "user" })
          .sort({ createdAt: -1 })
          .toArray();
        res.send(customers);
      } catch (error) {
        console.error("Get customers error:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to get customers" });
      }
    });

    app.get("/admin/owners", async (req, res) => {
      try {
        const owners = await usersCollection
          .find({ role: "owner" })
          .sort({ createdAt: -1 })
          .toArray();
        res.send(owners);
      } catch (error) {
        console.error("Get owners error:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to get owners" });
      }
    });

    app.get("/admin/admins", async (req, res) => {
      try {
        const admins = await usersCollection
          .find({ role: "admin" })
          .sort({ createdAt: -1 })
          .toArray();
        res.send(admins);
      } catch (error) {
        console.error("Get admins error:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to get admins" });
      }
    });

    app.delete("/admin/users/:email", async (req, res) => {
      try {
        const email = normalizeEmail(req.params.email);
        const user = await usersCollection.findOne({ email });

        if (!user) {
          return res
            .status(404)
            .send({ success: false, message: "User not found" });
        }

        if (user.role === "admin") {
          return res.status(403).send({
            success: false,
            message: "Admin account cannot be deleted",
          });
        }

        const result = await usersCollection.deleteOne({ email });
        if (result.deletedCount === 0) {
          return res
            .status(404)
            .send({ success: false, message: "User not found" });
        }

        res.send({ success: true, message: "User deleted successfully" });
      } catch (error) {
        console.error("Delete user error:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to delete user" });
      }
    });

    app.patch("/admin/users/:email/role", async (req, res) => {
      try {
        const email = normalizeEmail(req.params.email);
        const { role } = req.body;
        const allowedRoles = ["user", "owner", "admin"];

        if (!allowedRoles.includes(role)) {
          return res
            .status(400)
            .send({ success: false, message: "Invalid role" });
        }

        const result = await usersCollection.updateOne(
          { email },
          { $set: { role, updatedAt: new Date() } },
        );

        if (result.matchedCount === 0) {
          return res
            .status(404)
            .send({ success: false, message: "User not found" });
        }

        const updatedUser = await usersCollection.findOne({ email });
        res.send({
          success: true,
          message: `User role changed to ${role}`,
          user: updatedUser,
        });
      } catch (error) {
        console.error("Admin role update error:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to update user role" });
      }
    });

    // --- ADMIN TURF API ---
    app.get("/admin/turfs", async (req, res) => {
      try {
        const turfs = await turfsCollection
          .find({})
          .sort({ createdAt: -1 })
          .toArray();
        res.send(turfs);
      } catch (error) {
        console.error("Get admin turfs error:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to get turfs" });
      }
    });

    app.get("/admin/turfs/pending", async (req, res) => {
      try {
        const turfs = await turfsCollection
          .find({ status: "pending" })
          .sort({ createdAt: -1 })
          .toArray();
        res.send(turfs);
      } catch (error) {
        console.error("Get pending turfs error:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to get pending turfs" });
      }
    });

    app.patch("/admin/turfs/:id/approve", async (req, res) => {
      try {
        const id = req.params.id;
        if (!isValidObjectId(id)) {
          return res
            .status(400)
            .send({ success: false, message: "Invalid turf ID" });
        }

        const result = await turfsCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              status: "approved",
              approvedAt: new Date(),
              updatedAt: new Date(),
            },
          },
        );

        if (result.matchedCount === 0) {
          return res
            .status(404)
            .send({ success: false, message: "Turf not found" });
        }

        res.send({ success: true, message: "Turf approved successfully" });
      } catch (error) {
        console.error("Approve turf error:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to approve turf" });
      }
    });

    app.patch("/admin/turfs/:id/reject", async (req, res) => {
      try {
        const id = req.params.id;
        if (!isValidObjectId(id)) {
          return res
            .status(400)
            .send({ success: false, message: "Invalid turf ID" });
        }

        const result = await turfsCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              status: "rejected",
              rejectedAt: new Date(),
              updatedAt: new Date(),
            },
          },
        );

        if (result.matchedCount === 0) {
          return res
            .status(404)
            .send({ success: false, message: "Turf not found" });
        }

        res.send({ success: true, message: "Turf rejected successfully" });
      } catch (error) {
        console.error("Reject turf error:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to reject turf" });
      }
    });

    app.delete("/admin/turfs/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!isValidObjectId(id)) {
          return res
            .status(400)
            .send({ success: false, message: "Invalid turf ID" });
        }

        const result = await turfsCollection.deleteOne({
          _id: new ObjectId(id),
        });
        if (result.deletedCount === 0) {
          return res
            .status(404)
            .send({ success: false, message: "Turf not found" });
        }

        await wishlistCollection.deleteMany({ turfId: id });
        res.send({ success: true, message: "Turf deleted successfully" });
      } catch (error) {
        console.error("Admin delete turf error:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to delete turf" });
      }
    });

    // --- WISHLIST API ---

    // Get logged-in user's wishlist
    app.get("/wishlist/:email", async (req, res) => {
      try {
        const email = normalizeEmail(req.params.email);

        if (!email) {
          return res.status(400).send({
            success: false,
            message: "User email is required",
          });
        }

        const wishlistItems = await wishlistCollection
          .find({ userEmail: email })
          .sort({ createdAt: -1 })
          .toArray();

        if (wishlistItems.length === 0) {
          return res.send([]);
        }

        // Get all turf IDs
        const turfIds = wishlistItems
          .map((item) => item.turfId)
          .filter((id) => isValidObjectId(id))
          .map((id) => new ObjectId(id));

        // Get related turfs
        const turfs = await turfsCollection
          .find({
            _id: { $in: turfIds },
            status: "approved",
          })
          .toArray();

        // Match wishlist with turf
        const wishlistWithTurfs = wishlistItems
          .map((item) => {
            const turf = turfs.find(
              (turf) => turf._id.toString() === String(item.turfId),
            );

            if (!turf) return null;

            return {
              wishlistId: item._id,
              turfId: turf._id,
              name: turf.name,
              location: turf.location,
              description: turf.description || "",
              price: turf.price || 0,
              image: turf.image || "",
              size: turf.size || "",
              surface: turf.surface || "",
              facilities: turf.facilities || [],
              ownerEmail: turf.ownerEmail || "",
              status: turf.status,
              createdAt: item.createdAt,
            };
          })
          .filter(Boolean);

        res.send(wishlistWithTurfs);
      } catch (error) {
        console.error("Get wishlist error:", error);

        res.status(500).send({
          success: false,
          message: "Failed to get wishlist",
        });
      }
    });

    // Add turf to wishlist
    app.post("/wishlist", async (req, res) => {
      try {
        const { userEmail, turfId } = req.body;

        if (!userEmail || !turfId) {
          return res.status(400).send({
            success: false,
            message: "User email and turf ID are required",
          });
        }

        if (!isValidObjectId(turfId)) {
          return res.status(400).send({
            success: false,
            message: "Invalid turf ID",
          });
        }

        const email = normalizeEmail(userEmail);

        // Check turf
        const turf = await turfsCollection.findOne({
          _id: new ObjectId(turfId),
          status: "approved",
        });

        if (!turf) {
          return res.status(404).send({
            success: false,
            message: "Approved turf not found",
          });
        }

        // Check duplicate wishlist
        const existingWishlist = await wishlistCollection.findOne({
          userEmail: email,
          turfId: String(turfId),
        });

        if (existingWishlist) {
          return res.status(200).send({
            success: true,
            message: "Turf is already in wishlist",
            wishlist: existingWishlist,
          });
        }

        const newWishlist = {
          userEmail: email,
          turfId: String(turfId),
          createdAt: new Date(),
        };

        const result = await wishlistCollection.insertOne(newWishlist);

        const createdWishlist = await wishlistCollection.findOne({
          _id: result.insertedId,
        });

        res.status(201).send({
          success: true,
          message: "Turf added to wishlist",
          wishlist: createdWishlist,
        });
      } catch (error) {
        console.error("Add wishlist error:", error);

        res.status(500).send({
          success: false,
          message: "Failed to add turf to wishlist",
        });
      }
    });

    // Remove turf from wishlist
    app.delete("/wishlist/:email/:turfId", async (req, res) => {
      try {
        const email = normalizeEmail(req.params.email);
        const { turfId } = req.params;

        if (!email || !turfId) {
          return res.status(400).send({
            success: false,
            message: "User email and turf ID are required",
          });
        }

        if (!isValidObjectId(turfId)) {
          return res.status(400).send({
            success: false,
            message: "Invalid turf ID",
          });
        }

        const result = await wishlistCollection.deleteOne({
          userEmail: email,
          turfId: String(turfId),
        });

        if (result.deletedCount === 0) {
          return res.status(404).send({
            success: false,
            message: "Turf is not in wishlist",
          });
        }

        res.send({
          success: true,
          message: "Turf removed from wishlist",
        });
      } catch (error) {
        console.error("Remove wishlist error:", error);

        res.status(500).send({
          success: false,
          message: "Failed to remove turf from wishlist",
        });
      }
    });

    // Check whether a turf is in wishlist
    app.get("/wishlist/check/:email/:turfId", async (req, res) => {
      try {
        const email = normalizeEmail(req.params.email);
        const { turfId } = req.params;

        if (!email || !turfId) {
          return res.status(400).send({
            success: false,
            message: "User email and turf ID are required",
          });
        }

        const wishlist = await wishlistCollection.findOne({
          userEmail: email,
          turfId: String(turfId),
        });

        res.send({
          success: true,
          isWishlisted: !!wishlist,
        });
      } catch (error) {
        console.error("Check wishlist error:", error);

        res.status(500).send({
          success: false,
          message: "Failed to check wishlist",
        });
      }
    });

    // --- BOOKING API ---
    app.get("/bookings/availability", async (req, res) => {
      try {
        const { turfId, date } = req.query;
        if (!turfId || !date) {
          return res.status(400).send({
            success: false,
            message: "Turf ID and date are required",
          });
        }

        const bookings = await bookingsCollection
          .find({
            turfId,
            date,
            status: { $in: ["pending", "confirmed"] },
          })
          .sort({ startTime: 1 })
          .toArray();

        res.send(bookings);
      } catch (error) {
        console.error("Availability error:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to get availability" });
      }
    });

    app.get("/bookings/user/:email", async (req, res) => {
      try {
        const email = normalizeEmail(req.params.email);
        if (!email) {
          return res
            .status(400)
            .send({ success: false, message: "User email is required" });
        }

        console.log("Fetching bookings for:", email);
        const bookings = await bookingsCollection
          .find({ userEmail: email })
          .sort({ createdAt: -1 })
          .toArray();

        console.log(`Found ${bookings.length} bookings for ${email}`);
        res.send(bookings);
      } catch (error) {
        console.error("Get user bookings error:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to get user bookings" });
      }
    });

    app.get("/bookings/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!isValidObjectId(id)) {
          return res
            .status(400)
            .send({ success: false, message: "Invalid booking ID" });
        }

        const booking = await bookingsCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!booking) {
          return res
            .status(404)
            .send({ success: false, message: "Booking not found" });
        }

        res.send(booking);
      } catch (error) {
        console.error("Get booking error:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to get booking" });
      }
    });

    app.post("/bookings", async (req, res) => {
      try {
        const booking = req.body;
        const { turfId, userEmail, userName, date, startTime, endTime } =
          booking;

        if (!turfId || !userEmail || !date || !startTime || !endTime) {
          return res.status(400).send({
            success: false,
            message:
              "Turf ID, user email, date, start time and end time are required",
          });
        }

        if (!isValidObjectId(turfId)) {
          return res
            .status(400)
            .send({ success: false, message: "Invalid turf ID" });
        }

        const normalizedUserEmail = normalizeEmail(userEmail);
        const turf = await turfsCollection.findOne({
          _id: new ObjectId(turfId),
          status: "approved",
        });

        if (!turf) {
          return res.status(404).send({
            success: false,
            message: "Approved turf not found",
          });
        }

        const existingBooking = await bookingsCollection.findOne({
          turfId,
          date,
          status: { $in: ["pending", "confirmed"] },
          startTime: { $lt: endTime },
          endTime: { $gt: startTime },
        });

        if (existingBooking) {
          return res.status(409).send({
            success: false,
            message: "This time slot is already booked",
          });
        }

        const finalPrice = Number(turf.price);
        if (Number.isNaN(finalPrice) || finalPrice < 0) {
          return res
            .status(400)
            .send({ success: false, message: "Invalid turf price" });
        }

        const newBooking = {
          turfId: String(turfId),
          turfName: turf.name,
          location: turf.location || "",
          userEmail: normalizedUserEmail,
          userName: userName ? String(userName).trim() : "",
          ownerEmail: normalizeEmail(turf.ownerEmail || ""),
          date: String(date),
          startTime: String(startTime),
          endTime: String(endTime),
          price: finalPrice,
          status: "pending",
          paymentStatus: "unpaid",
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await bookingsCollection.insertOne(newBooking);
        const createdBooking = await bookingsCollection.findOne({
          _id: result.insertedId,
        });

        res.status(201).send({
          success: true,
          message: "Booking created successfully",
          bookingId: result.insertedId,
          booking: createdBooking,
        });
      } catch (error) {
        console.error("Create booking error:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to create booking" });
      }
    });

    app.patch("/bookings/:id/cancel", async (req, res) => {
      try {
        const id = req.params.id;
        if (!isValidObjectId(id)) {
          return res
            .status(400)
            .send({ success: false, message: "Invalid booking ID" });
        }

        const booking = await bookingsCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!booking) {
          return res
            .status(404)
            .send({ success: false, message: "Booking not found" });
        }

        if (booking.status === "cancelled") {
          return res.status(400).send({
            success: false,
            message: "Booking is already cancelled",
          });
        }

        if (booking.status === "completed") {
          return res.status(400).send({
            success: false,
            message: "Completed booking cannot be cancelled",
          });
        }

        const result = await bookingsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "cancelled", updatedAt: new Date() } },
        );

        if (result.modifiedCount === 0) {
          return res.status(400).send({
            success: false,
            message: "Booking cancellation failed",
          });
        }

        res.send({ success: true, message: "Booking cancelled successfully" });
      } catch (error) {
        console.error("Cancel booking error:", error);
        res
          .status(500)
          .send({ success: false, message: "Failed to cancel booking" });
      }
    });
  } catch (error) {
    console.error("Server error:", error);
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Khelaro Server running on port ${port}`);
});
