document
  .getElementById("adminLoginForm")
  .addEventListener("submit", async function (event) {
    event.preventDefault();

    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    try {
      const response = await fetch("http://localhost:5000/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const result = await response.json();
      const messageDiv = document.getElementById("message");

      if (response.ok) {
        messageDiv.style.color = "green";
        messageDiv.textContent = result.message;
        window.location.href = "/admin/dashboard"; // Redirect to dashboard
      } else {
        messageDiv.style.color = "red";
        messageDiv.textContent = result.error || "Login failed.";
      }
    } catch (error) {
      document.getElementById("message").textContent = "An error occurred.";
    }
  });
