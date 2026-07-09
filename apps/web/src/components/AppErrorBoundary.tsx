import { Component, type ReactNode } from "react";
import { StatusScreen } from "./StatusScreen";

type AppErrorBoundaryProps = {
  children: ReactNode;
  onReload?: () => void;
};

type AppErrorBoundaryState = {
  hasError: boolean;
};

function reloadApplication() {
  window.location.reload();
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("Unexpected application render error", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <StatusScreen
          kind="error"
          message="Something went wrong."
          hint="Reload the application to try again."
          onRetry={this.props.onReload ?? reloadApplication}
          retryLabel="Reload application"
        />
      );
    }

    return this.props.children;
  }
}
