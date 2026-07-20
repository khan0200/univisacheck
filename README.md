# SalomKorea

A modern, real-time visa status tracking and education portal application for university students applying for Korean visas.

## Features

- 🔄 **Real-time Status Tracking** - Automatically check visa application status
- 📱 **Mobile-First Design** - Optimized for mobile devices with clean, modern UI
- 🔔 **Status Notifications** - Get notified when visa status changes
- 🎨 **Dark Mode Support** - Beautiful dark theme for comfortable viewing
- ⚡ **Fast & Responsive** - Built with performance in mind
- 🔥 **Firebase Integration** - Real-time database synchronization

## Tech Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Backend**: Node.js (Proxy Server)
- **Database**: Firebase Firestore
- **Icons**: Bootstrap Icons
- **Fonts**: Montserrat

## Setup

1. Clone the repository:

```bash
git clone https://github.com/yourusername/visacheck.git
cd visacheck
```

1. Install dependencies:

```bash
npm install
```

1. Configure Firebase:
   - Create a new Firebase project
   - Update `config.js` with your Firebase credentials

2. Start the proxy server:

```bash
node proxy.js
```

1. Open `index.html` in your browser

## Project Structure

```
visacheck/
├── index.html          # Main application page
├── app.js              # Application logic
├── style.css           # Styles and responsive design
├── config.js           # Configuration file
├── proxy.js            # CORS proxy server
└── README.md           # This file
```

## Features in Detail

### Visa Status Categories

- **Application** - Pending applications and under review
- **Cancelled** - Rejected or cancelled applications
- **Approved** - Approved visa applications

### Mobile Design

- Clean card-based layout
- Large touch targets (48px+)
- Optimized spacing and typography
- Smooth animations and transitions

## License

MIT License - feel free to use this project for your own purposes.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
