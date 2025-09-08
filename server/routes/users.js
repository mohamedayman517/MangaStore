const express = require("express");
const router = express.Router();
const { admin, db } = require("../utils/firebase");
const { encryptData, decryptData } = require("../utils/cryptoHelper");
const verifyAdmin = require("../middlewares/verifyAdmin");

const setRole = async (uid, claims) => {
  try {
    await admin.auth().setCustomUserClaims(uid, claims);
    await admin
      .firestore()
      .collection("users")
      .doc(uid)
      .update({ role: encryptData(claims.role) }, { merge: true });
  } catch (error) {
    console.error("Error setting custom claims:", error);
  }
};

const fetchUsers = async (pageToken = undefined) => {
  try {
    const listUsersResult = await admin.auth().listUsers(100, pageToken); // Fetch 100 users
    const users = listUsersResult.users.map((userRecord) => {
      return userRecord.toJSON();
    });

    return {
      users, // Current 100 users
      nextPageToken: listUsersResult.pageToken || null, // Token for next batch
    };
  } catch (error) {
    console.error("Error fetching users:", error);
  }
};

router.get("/", verifyAdmin, async (req, res) => {
  let { users, nextPageToken } = await fetchUsers();
  res.render("users", { users });
});

// Disable Account
router.post("/disable/:id", verifyAdmin, async (req, res) => {
  const uid = req.params.id;
  try {
    await admin.auth().updateUser(uid, {
      disabled: true,
    });
    res.send(JSON.stringify("User disabled successfully"));
  } catch (error) {
    res.send(JSON.stringify(`Error while disabling user: ${error}`));
    console.error("Error while disabling user", error);
  }
});

// Enable Account
router.post("/enable/:id", verifyAdmin, async (req, res) => {
  const uid = req.params.id;
  try {
    await admin.auth().updateUser(uid, {
      disabled: false,
    });
    res.send(JSON.stringify("User enabled successfully"));
  } catch (error) {
    res.send(JSON.stringify(`Error while enabling user: ${error}`));
    console.error("Error while enabling user", error);
  }
});

// Delete Account
router.delete("/delete/:id", verifyAdmin, async (req, res) => {
  const uid = req.params.id;
  try {
    await admin.auth().deleteUser(uid);
    db.collection("users").delete(uid);
    res.send(JSON.stringify("User deleted successfully"));
  } catch (error) {
    console.error("Error deleting user:", error);
    res.send(JSON.stringify(`Error deleting user: ${error} `));
  }
});

// get user details
router.post("/details/:id", verifyAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const userDoc = await db.collection("users").doc(userId).get();

    if (!userDoc.exists) {
      return res.status(404).send("User not found.");
    }

    const userData = userDoc.data();

    let role = null;
    if (userData.role) {
      role = decryptData(userData.role);
    }

    const data = {
      role: role || "User",
      uid: userId,
      name: decryptData(userData.name),
      phoneNumber: `${decryptData(userData.countryCode)}${decryptData(userData.phoneNumber)}`,
      email: decryptData(userData.email),
      signupMethod: decryptData(userData.signupMethod),
      gender: decryptData(userData.gender),
      createdAt: userData.createdAt.toDate().toLocaleString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: "UTC",
      }),
    };

    res.send(JSON.stringify(data));
  } catch (error) {
    // Handle specific errors
    if (error.code === "permission-denied") {
      res.status(403).send("You don't have permission to view user details.");
    } else {
      console.error("Error fetching user details:", error);
      res.status(500).send("An error occurred. Please try again later.");
    }
  }
});

// Assign a role
router.post("/assign-role", verifyAdmin, async (req, res) => {
  const uid = req.body.uid;
  const role = req.body.role;

  try {
    await setRole(uid, { role: role });
    res.status(200).json({ success: true, message: "Role assigned successfully" });
  } catch (error) {
    console.error("Error assigning role:", error);
    res.status(500).json({ success: false, error: `Error assigning role ${error.message}` });
  }
});

module.exports = router;
