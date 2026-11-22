package de.fabian.radreise;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BikerouterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
