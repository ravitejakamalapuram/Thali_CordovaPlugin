//
//  The MIT License (MIT)
//
//  Copyright (c) 2015 Microsoft
//
//  Permission is hereby granted, free of charge, to any person obtaining a copy
//  of this software and associated documentation files (the "Software"), to deal
//  in the Software without restriction, including without limitation the rights
//  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
//  copies of the Software, and to permit persons to whom the Software is
//  furnished to do so, subject to the following conditions:
//
//  The above copyright notice and this permission notice shall be included in
//  all copies or substantial portions of the Software.
//
//  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
//  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
//  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
//  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
//  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
//  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
//  THE SOFTWARE.
//
//  Thali CordovaPlugin
//  THEPeerSession.h
//

#import <MultipeerConnectivity/MultipeerConnectivity.h>

typedef NS_ENUM(NSUInteger, THEPeerSessionState) {
  THEPeerSessionStateNotConnected  = 0,
  THEPeerSessionStateConnecting    = 1,
  THEPeerSessionStateConnected     = 2
};

// Encapsulates a discovered peer and their connection state. Any peer that has been discovered 
// will have a PeerSession object although they may not currently be visible or connected. 
// The underlying connection transport may be any available e.g. Bluetooth, WiFi etc.
@interface THEPeerSession : NSObject <MCSessionDelegate>

@property (nonatomic) BOOL visible;
@property (nonatomic) MCPeerID * peerID;
@property (nonatomic) THEPeerSessionState connectionState;

- (instancetype)initWithPeerID:(MCPeerID *)peerID withSessionType:(NSString *)sessionType;

- (MCSession *)session;
- (MCSession *)connect;

- (void)disconnect;

@end

