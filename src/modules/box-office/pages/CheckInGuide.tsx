import { Smartphone, QrCode, Camera, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const CheckInGuide = () => {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/.test(navigator.userAgent);
  const scannerUrl = `${window.location.origin}/check-in-scanner`;

  const handleOpenScanner = () => {
    if (!isAdmin) {
      navigate("/auth");
      return;
    }
    navigate("/check-in-scanner");
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-primary mb-2">Check-In Scanner Setup</h1>
          <p className="text-muted-foreground">Get ready for event check-in in 2 minutes</p>
        </div>

        {/* Quick Access Button */}
        <Card className="mb-6 border-primary/20">
          <CardHeader className="text-center pb-3">
            <CardTitle className="flex items-center justify-center gap-2">
              <QrCode className="h-5 w-5" />
              Quick Start
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-3">
            {!isAdmin && (
              <p className="text-sm text-muted-foreground mb-2">
                Admin login required to access scanner
              </p>
            )}
            <Button 
              onClick={handleOpenScanner} 
              size="lg" 
              className="w-full max-w-sm"
            >
              <Camera className="mr-2 h-5 w-5" />
              {isAdmin ? "Open Scanner Now" : "Login to Access Scanner"}
            </Button>
          </CardContent>
        </Card>

        {/* Installation Instructions */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Install as App (Recommended)
            </CardTitle>
            <CardDescription>
              For the best experience, install this on your phone's home screen
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isIOS && (
              <div className="bg-primary/5 p-4 rounded-lg">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Smartphone className="h-4 w-4" />
                  iPhone Instructions
                </h3>
                <ol className="list-decimal list-inside space-y-2 text-sm">
                  <li>Tap the <strong>Share button</strong> (box with arrow up) at the bottom</li>
                  <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
                  <li>Tap <strong>"Add"</strong> in the top right</li>
                  <li>The app icon will appear on your home screen</li>
                </ol>
              </div>
            )}

            {isAndroid && (
              <div className="bg-primary/5 p-4 rounded-lg">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Smartphone className="h-4 w-4" />
                  Android Instructions
                </h3>
                <ol className="list-decimal list-inside space-y-2 text-sm">
                  <li>Tap the <strong>three dots menu</strong> (⋮) in the top right</li>
                  <li>Tap <strong>"Install app"</strong> or <strong>"Add to Home Screen"</strong></li>
                  <li>Tap <strong>"Install"</strong></li>
                  <li>The app icon will appear on your home screen</li>
                </ol>
              </div>
            )}

            {!isIOS && !isAndroid && (
              <div className="bg-muted p-4 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  Open this page on your phone to see installation instructions for your device.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Features */}
        <Card>
          <CardHeader>
            <CardTitle>What You'll Get</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <div className="mt-1 rounded-full bg-primary/10 p-1">
                  <QrCode className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Fast QR Code Scanner</p>
                  <p className="text-sm text-muted-foreground">Instant ticket validation with camera</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-1 rounded-full bg-primary/10 p-1">
                  <Smartphone className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Works Offline</p>
                  <p className="text-sm text-muted-foreground">No internet needed once loaded</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="mt-1 rounded-full bg-primary/10 p-1">
                  <Download className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Full Screen Experience</p>
                  <p className="text-sm text-muted-foreground">Opens like a native app</p>
                </div>
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* URL Display */}
        <div className="mt-6 p-4 bg-muted rounded-lg text-center">
          <p className="text-xs text-muted-foreground mb-2">Share this URL:</p>
          <code className="text-xs bg-background px-3 py-1 rounded break-all">
            {window.location.origin}/check-in
          </code>
        </div>
      </div>
    </div>
  );
};

export default CheckInGuide;
