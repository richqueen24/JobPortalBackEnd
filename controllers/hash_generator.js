import bcrypt from "bcryptjs";

const newPassword = "test12345"; // <-- Use this simple temporary password

(async () => {
    try {
        const newHash = await bcrypt.hash(newPassword, 10);
        console.log("--- NEW HASH TO COPY ---");
        console.log(newHash); // <--- THIS LINE PRINTS THE HASH!
        console.log("--------------------------");
    } catch (error) {
        console.error(error);
    }
})();