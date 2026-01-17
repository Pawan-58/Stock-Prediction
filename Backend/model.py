import torch
import torch.nn as nn

class SiameseNetwork(nn.Module):
    def __init__(self, input_dim):
        super(SiameseNetwork, self).__init__()
        self.encoder = nn.Sequential(
            nn.Linear(input_dim, 1024),
            nn.Tanh(),
            nn.Linear(1024, 32),
            nn.Tanh()
        )

    def forward_one(self, x):
        return self.encoder(x)

    def forward(self, x1, x2):
        return self.forward_one(x1), self.forward_one(x2)
