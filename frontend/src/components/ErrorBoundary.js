import { Component } from "react";

/** One broken component must not turn the whole dashboard into a white page. */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("The dashboard hit an error:", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="boundary" role="alert">
        <h2>{this.props.title || "Something went wrong"}</h2>
        <p>{this.props.message || "This part of the dashboard stopped working. Your data is safe."}</p>
        <button type="button" className="dialog-button dialog-button--primary" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
        <button type="button" className="dialog-button" onClick={() => window.location.reload()}>
          Reload the page
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;
