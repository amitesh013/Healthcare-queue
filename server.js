const express = require("express");
const cors = require("cors");
const path = require("path");
const PDFDocument = require("pdfkit");
const mysql = require("mysql2");

const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "111315",
    database: "hospital_db"
});

db.connect(err => {
    if (err) throw err;
    console.log("MySQL Connected...");
});

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

let reports = [];
let doctorAttendance = {};
let appointments = [];
let idCounter = 1;

/* AUTO REMOVE ONLY NOT ARRIVED PATIENTS AFTER 3 MINUTES */
setInterval(() => {

    const now = new Date();
    const today = now.toLocaleDateString('en-CA');

    appointments = appointments.filter(a => {
        if (a.priority === "Emergency") return true;
        if (a.status !== "Not Arrived") return true;
        if (a.date !== today) return true;
        const appointmentDateTime = new Date(`${a.date}T${a.time}`);
        if (now < appointmentDateTime) return true;
        const diff = now - appointmentDateTime;
        return diff < 3 * 60 * 1000;
    });

}, 5000);

/* ROUTES */

app.get("/appointments", (req, res) => {
    res.json(appointments);
});

app.post("/appointment", (req, res) => {
    const newAppointment = {
        id: idCounter++,
        token: 0,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        age: req.body.age,
        problem: req.body.problem,
        doctor: req.body.doctor,
        date: req.body.date,
        time: req.body.time,
        priority: "Normal",
        status: "Not Arrived"
    };

    appointments.push(newAppointment);

    appointments.sort((a,b)=>{
        if(a.priority==="Emergency" && b.priority!=="Emergency") return -1;
        if(a.priority!=="Emergency" && b.priority==="Emergency") return 1;
        const dateA = new Date(a.date + " " + a.time);
        const dateB = new Date(b.date + " " + b.time);
        return dateA - dateB;
    });

    appointments.forEach((a,index)=>{
        a.token = index + 101;
    });

    res.json({ message: "Appointment Added" });
});

app.post("/emergency", (req, res) => {
    const emergencyPatient = {
        id: idCounter++,
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        age: req.body.age,
        problem: req.body.problem,
        doctor: req.body.doctor,
        date: new Date().toLocaleDateString('en-CA'),
        time: req.body.time,
        priority: "Emergency",
        status: "Not Arrived"
    };

    appointments.unshift(emergencyPatient);

    appointments.sort((a,b)=>{
        if(a.priority==="Emergency" && b.priority!=="Emergency") return -1;
        if(a.priority!=="Emergency" && b.priority==="Emergency") return 1;
        const dateA = new Date(a.date + " " + a.time);
        const dateB = new Date(b.date + " " + b.time);
        return dateA - dateB;
    });

    appointments.forEach((a,index)=>{
        a.token = index + 101;
    });

    res.json({ message: "Emergency Added" });
});

app.post("/registerPatient", (req, res) => {
    const { username, password } = req.body;
    const sql = "INSERT INTO patients (username, password) VALUES (?, ?)";
    db.query(sql, [username, password], (err, result) => {
        if (err) {
            return res.json({ message: "Username already exists!" });
        }
        res.json({ message: "Patient registered successfully!" });
    });
});

app.post("/loginPatient", (req, res) => {
    const { username, password } = req.body;
    const sql = "SELECT * FROM patients WHERE username = ?";
    db.query(sql, [username], (err, results) => {
        if (results.length === 0) {
            return res.json({ message: "User not found!" });
        }
        if (results[0].password !== password) {
            return res.json({ message: "Incorrect password!" });
        }
        res.json({ message: "Patient logged in successfully!" });
    });
});

app.post("/loginStaff", (req, res) => {
    const { username, password } = req.body;
    const staff = ['staff001', 'staff002', 'staff003'];
    if (!staff.includes(username) || username !== password) {
        return res.json({ message: "Incorrect username or password!" });
    }
    res.json({ message: "Staff logged in successfully!" });
});

app.post("/loginDoctor", (req, res) => {
    const { username, password } = req.body;
    const doctors = ['doc001', 'doc002', 'doc003'];
    if (!doctors.includes(username) || username !== password) {
        return res.json({ message: "Incorrect username or password!" });
    }
    res.json({ message: "Doctor logged in successfully!", doctorName: DOCTOR_MAP[username] });
});

/* UPDATE STATUS */
app.post("/status", (req, res) => {
    const { id, status } = req.body;

    if (status === "Completed") {
        const completedPatient = appointments.find(a => a.id === id);
        appointments = appointments.filter(a => a.id !== id);
        if (appointments.length > 0 && completedPatient) {
            const nextToken = appointments[0].token;
            return res.json({
                message: `Token no ${completedPatient.token} completed, token no ${nextToken} should meet the doc`
            });
        }
        return res.json({ message: "Last token completed" });
    } else {
        const patient = appointments.find(a => a.id === id);
        if (patient) {
            patient.status = status;
        }
    }

    res.json({ message: "Status Updated" });
});

app.post("/generateReceipt", (req, res) => {
    const { name, amount, mode } = req.body;

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=Payment_Receipt.pdf");
    doc.pipe(res);

    // ── LOGO HEADER ──
    doc.fontSize(22).fillColor("#2563eb").font("Helvetica-Bold").text("Healthcare", { align: "center" });
    doc.fontSize(10).fillColor("#64748b").font("Helvetica").text("Caring Beyond Life", { align: "center" });
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#2563eb").lineWidth(2).stroke();
    doc.moveDown(1);

    // ── TITLE ──
    doc.fontSize(16).fillColor("#0f172a").font("Helvetica-Bold").text("Payment Receipt", { align: "center" });
    doc.moveDown(1);

    // ── DETAILS ──
    doc.fontSize(12).font("Helvetica-Bold").fillColor("#0f172a").text("Patient Name: ", { continued: true }).font("Helvetica").text(name);
    doc.font("Helvetica-Bold").text("Amount Paid: ", { continued: true }).font("Helvetica").text(`Rs. ${amount}`);
    doc.font("Helvetica-Bold").text("Payment Mode: ", { continued: true }).font("Helvetica").text(mode);
    doc.font("Helvetica-Bold").text("Date: ", { continued: true }).font("Helvetica").text(new Date().toLocaleDateString());
    doc.moveDown(1);

    // ── FOOTER ──
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#e2e8f0").lineWidth(1).stroke();
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor("#64748b").text(`Generated on: ${new Date().toLocaleString()}`, { align: "right" });
    doc.text("Healthcare — Caring Beyond Life", { align: "center" });

    doc.end();
});

app.post("/generateReportPDF", (req, res) => {
    reports.push(req.body);
    const { name, age, problem, fee, assessment, diagnosis, prescription } = req.body;

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=Medical_Report.pdf");
    doc.pipe(res);

    // ── LOGO HEADER ──
    doc.fontSize(22).fillColor("#2563eb").font("Helvetica-Bold").text("Healthcare", { align: "center" });
    doc.fontSize(10).fillColor("#64748b").font("Helvetica").text("Caring Beyond Life", { align: "center" });
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#2563eb").lineWidth(2).stroke();
    doc.moveDown(1);

    // ── TITLE ──
    doc.fontSize(16).fillColor("#0f172a").font("Helvetica-Bold").text("Medical Report", { align: "center" });
    doc.moveDown(1);

    // ── FIELDS ──
    doc.fontSize(12).fillColor("#0f172a").font("Helvetica-Bold").text("Patient Name: ", { continued: true }).font("Helvetica").text(name);
    doc.font("Helvetica-Bold").text("Age: ", { continued: true }).font("Helvetica").text(age);
    doc.font("Helvetica-Bold").text("Problem: ", { continued: true }).font("Helvetica").text(problem);
    if (fee) {
        doc.font("Helvetica-Bold").text("Consultation Fee: ", { continued: true }).font("Helvetica").text(`Rs. ${fee}`);
    }
    doc.moveDown(0.5);
    doc.font("Helvetica-Bold").text("Assessment:");
    doc.font("Helvetica").text(assessment);
    doc.moveDown(0.5);
    doc.font("Helvetica-Bold").text("Diagnosis:");
    doc.font("Helvetica").text(diagnosis);
    doc.moveDown(0.5);
    doc.font("Helvetica-Bold").text("Prescription:");
    doc.font("Helvetica").text(prescription);
    doc.moveDown(1);

    // ── FOOTER ──
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#e2e8f0").lineWidth(1).stroke();
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor("#64748b").text(`Generated on: ${new Date().toLocaleString()}`, { align: "right" });
    doc.text("Healthcare — Caring Beyond Life", { align: "center" });

    doc.end();
});

app.get("/getReport", (req, res) => {
    res.json(reports[reports.length - 1] || {});
});

/* ── NEW: CHECK FEE ROUTE ── */
app.get("/checkFee", (req, res) => {
    const latest = reports[reports.length - 1];
    if (latest && latest.fee) {
        res.json({ fee: latest.fee, name: latest.name });
    } else {
        res.json({ fee: null });
    }
});

app.post("/complete", (req, res) => {
    const { id } = req.body;
    appointments = appointments.filter(a => a.id !== id);
    res.json({ message: "Completed" });
});

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// Predefined doctor full names — keep in sync with DOCTOR_LIST in index.html
const DOCTOR_NAMES = [
    "Dr. Arjun Sharma",
    "Dr. Priya Nair",
    "Dr. Ramesh Kumar",
    "Dr. Sneha Patel",
    "Dr. Vikram Rao"
];

const DOCTOR_MAP = {
    'doc001': 'Dr. Arjun Sharma',
    'doc002': 'Dr. Priya Nair',
    'doc003': 'Dr. Ramesh Kumar'
};

app.get("/doctors", (req, res) => {
    res.json(DOCTOR_NAMES);
});

app.post("/markAttendance", (req, res) => {
    const { doctorName, present } = req.body;
    const isValid = DOCTOR_NAMES.some(d => d.toLowerCase() === doctorName.toLowerCase());
    if (!isValid) {
        return res.json({ message: "Doctor name not found in system!" });
    }
    doctorAttendance[doctorName.toLowerCase()] = present;
    res.json({ message: "Attendance marked!" });
});

app.get("/attendance", (req, res) => {
    res.json(doctorAttendance);
});

app.listen(5000, () => {
    console.log("Server running on http://localhost:5000");
});