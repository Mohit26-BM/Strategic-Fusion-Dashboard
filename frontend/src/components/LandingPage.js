function LandingPage({ onEnter }) {
  return (
    <div style={containerStyle}>
      <div style={contentStyle}>
        {/* Animated Icon */}
        <div style={iconContainerStyle}>
          <div style={pulseStyle}>🛰️</div>
        </div>

        {/* Title */}
        <h1 style={titleStyle}>
          Strategic Intelligence
          <br />
          Fusion Dashboard
        </h1>

        {/* Subtitle */}
        <p style={subtitleStyle}>
          Multi-source geospatial intelligence visualization platform
        </p>

        {/* Feature Pills */}
        <div style={featuresStyle}>
          <span style={pillStyle}>Real-time Mapping</span>
          <span style={pillStyle}>MongoDB Integration</span>
          <span style={pillStyle}>Multi-source Intel</span>
        </div>

        {/* CTA Button */}
        <button onClick={onEnter} style={buttonStyle}>
          Launch Dashboard
        </button>

        <p style={footerStyle}>OSINT • HUMINT • IMINT Fusion</p>
      </div>
    </div>
  );
}

const containerStyle = {
  height: "100vh",
  background: "linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "white",
  fontFamily: "Arial, sans-serif",
};

const contentStyle = {
  textAlign: "center",
  maxWidth: "600px",
  padding: "40px",
  animation: "fadeIn 0.8s ease-in",
};

const iconContainerStyle = {
  marginBottom: "20px",
};

const pulseStyle = {
  fontSize: "80px",
  display: "inline-block",
  animation: "pulse 2s ease-in-out infinite",
};

const titleStyle = {
  fontSize: "42px",
  fontWeight: "bold",
  margin: "0 0 15px 0",
  lineHeight: "1.2",
  textShadow: "2px 2px 4px rgba(0,0,0,0.3)",
};

const subtitleStyle = {
  fontSize: "18px",
  color: "rgba(255,255,255,0.8)",
  margin: "0 0 30px 0",
};

const featuresStyle = {
  display: "flex",
  gap: "10px",
  justifyContent: "center",
  flexWrap: "wrap",
  marginBottom: "40px",
};

const pillStyle = {
  background: "rgba(255,255,255,0.1)",
  border: "1px solid rgba(255,255,255,0.2)",
  padding: "8px 16px",
  borderRadius: "20px",
  fontSize: "14px",
  backdropFilter: "blur(10px)",
};

const buttonStyle = {
  background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  color: "white",
  border: "none",
  padding: "16px 48px",
  fontSize: "18px",
  fontWeight: "bold",
  borderRadius: "8px",
  cursor: "pointer",
  boxShadow: "0 8px 24px rgba(102, 126, 234, 0.4)",
  transition: "transform 0.2s, box-shadow 0.2s",
  marginBottom: "20px",
};

const footerStyle = {
  fontSize: "12px",
  color: "rgba(255,255,255,0.5)",
  margin: "20px 0 0 0",
  letterSpacing: "2px",
};

export default LandingPage;
